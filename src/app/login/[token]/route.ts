import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifyLoginLinkToken,
} from "@/lib/auth";

// PRD-11: the Telegram-link login. The bot mints a short-lived login token and
// texts the user `/login/<token>`. Opening it verifies the token, then swaps it
// for a long-lived session cookie bound to that user id and drops them on the
// board. The link is one hop; the durable credential is the session cookie.
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const secret = process.env.APP_SECRET;
  if (!secret) {
    return NextResponse.redirect(new URL("/get-started?error=1", req.url), 303);
  }
  const userId = await verifyLoginLinkToken(token, secret);
  if (userId === null) {
    return NextResponse.redirect(new URL("/get-started?error=1", req.url), 303);
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
