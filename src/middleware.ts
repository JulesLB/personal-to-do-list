import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const secret = process.env.APP_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!secret || !(await verifySessionToken(token, secret))) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

// Protect the board; leave the login page, API routes, and static files open.
// The `.*\..*` clause skips anything with a file extension (e.g. /logo.png) so
// public assets aren't redirected to /login — that was breaking the login logo.
export const config = {
  matcher: ["/((?!login|api|_next|.*\\..*).*)"],
};
