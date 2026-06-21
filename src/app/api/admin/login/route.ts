import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  createAdminToken,
  passwordMatches,
} from "@/lib/auth";
import { clientIp, isLockedOut, recordAttempt } from "@/lib/ratelimit";

// Ops-console login. A correct ADMIN_SECRET issues a signed admin_auth cookie.
// Deliberately separate from /api/login: the board password grants no access here.
// Brute force is throttled per-IP via a DB-backed limiter (defense in depth on
// top of the secret itself).
export async function POST(req: NextRequest) {
  const ip = clientIp(req);

  // Too many recent failures from this IP: refuse before even checking the key,
  // so guessing can't continue. The limiter counts only failures, so a real
  // owner who got it right earlier isn't affected.
  if (await isLockedOut(ip, "admin")) {
    return NextResponse.redirect(new URL("/admin/login?error=rate", req.url), 303);
  }

  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  const secret = process.env.ADMIN_SECRET;

  if (secret && key && (await passwordMatches(key, secret))) {
    await recordAttempt(ip, "admin", true);
    const res = NextResponse.redirect(new URL("/admin", req.url), 303);
    res.cookies.set(ADMIN_SESSION_COOKIE, await createAdminToken(secret), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
    });
    return res;
  }

  await recordAttempt(ip, "admin", false);
  return NextResponse.redirect(new URL("/admin/login?error=1", req.url), 303);
}
