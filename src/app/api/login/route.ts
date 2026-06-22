import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";
import { ownerUser } from "@/lib/user";
import { clientIp, isLockedOut, recordAttempt } from "@/lib/ratelimit";

// The shared-password login, kept as the owner's fast path: a correct key logs in
// as the owner (first user). Everyone else uses the Telegram-link login (the bot's
// `/board` command → /login/<token>). PRD-11.
//
// Brute force is throttled per-IP via the same DB-backed limiter the admin login
// uses (defense in depth on top of the secret): too many recent failures from an
// IP lock it out before the key is even checked.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (await isLockedOut(ip, "board")) {
    return NextResponse.redirect(new URL("/get-started?error=rate", req.url), 303);
  }

  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  const secret = process.env.APP_SECRET;

  if (secret && key && (await passwordMatches(key, secret))) {
    const owner = await ownerUser();
    if (owner) {
      await recordAttempt(ip, "board", true);
      const res = NextResponse.redirect(new URL("/", req.url), 303);
      res.cookies.set(SESSION_COOKIE, await createSessionToken(owner.id, secret), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE,
      });
      return res;
    }
  }

  await recordAttempt(ip, "board", false);
  return NextResponse.redirect(new URL("/get-started?error=1", req.url), 303);
}
