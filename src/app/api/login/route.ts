import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  passwordMatches,
} from "@/lib/auth";
import { ownerUser } from "@/lib/user";

// The shared-password login, kept as the owner's fast path: a correct key logs in
// as the owner (first user). Everyone else uses the Telegram-link login (the bot's
// `/board` command → /login/<token>). PRD-11.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");
  const secret = process.env.APP_SECRET;

  if (secret && key && (await passwordMatches(key, secret))) {
    const owner = await ownerUser();
    if (owner) {
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
  return NextResponse.redirect(new URL("/login?error=1", req.url), 303);
}
