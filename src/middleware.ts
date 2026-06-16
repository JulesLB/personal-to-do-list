import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const auth = req.cookies.get("app_auth")?.value;
  if (!process.env.APP_SECRET || auth !== process.env.APP_SECRET) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

// Protect the board; leave the login page, API routes, and assets open.
export const config = {
  matcher: ["/((?!login|api|_next|favicon.ico).*)"],
};
