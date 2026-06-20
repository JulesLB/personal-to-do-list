import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  const secret = process.env.APP_SECRET;

  if (secret && key && (await passwordMatches(key, secret))) {
    const res = NextResponse.redirect(new URL("/", req.url), 303);
    res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  }
  return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
}
