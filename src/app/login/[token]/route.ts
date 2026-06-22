import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyLoginLinkToken,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

// PRD-11: the Telegram-link login. The bot mints a short-lived login token and
// texts the user `/login/<token>`. Opening it verifies the token, then swaps it
// for a long-lived session cookie bound to that user id and drops them on the
// board. The link is one hop; the durable credential is the session cookie.
//
// Single-use: the bot promises the link "works once". We enforce that by recording
// the token's signature in the Setting table on first use and refusing any replay,
// so a link that leaks (chat history, a logging proxy) can't be reused inside its
// 10-minute window.
const failed = (req: NextRequest) =>
  NextResponse.redirect(new URL("/get-started?error=1", req.url), 303);

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const secret = process.env.APP_SECRET;
  if (!secret) return failed(req);

  const userId = await verifyLoginLinkToken(token, secret);
  if (userId === null) return failed(req);

  // The signature is the unique part of the token; key the "consumed" marker by it.
  const sig = token.split(".")[2];
  const key = `loginused:${sig}`;
  const exp = token.split(".")[1]; // unix seconds, fixed-width for cleanup compare

  try {
    const seen = await prisma.setting.findUnique({ where: { key } });
    if (seen) return failed(req); // already consumed: refuse the replay
    await prisma.setting.create({ data: { key, value: exp } });
    // Opportunistic cleanup of markers whose tokens have expired (fixed-width unix
    // seconds, so a lexicographic compare matches a numeric one).
    await prisma.setting
      .deleteMany({
        where: { key: { startsWith: "loginused:" }, value: { lt: String(Math.floor(Date.now() / 1000)) } },
      })
      .catch(() => {});
  } catch {
    // If the marker store is unavailable, fall through and still log the user in:
    // the 10-minute expiry is the backstop, and locking out a valid login on a DB
    // hiccup is worse than the small replay window.
  }

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, await createSessionToken(userId, secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
