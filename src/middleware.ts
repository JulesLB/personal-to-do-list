import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  verifySessionToken,
  ADMIN_SESSION_COOKIE,
  verifyAdminToken,
} from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The ops console is gated by its own ADMIN_SECRET, separate from the board.
  // /admin/login is the only open /admin path (it's the way in).
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") return NextResponse.next();
    const secret = process.env.ADMIN_SECRET;
    const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!secret || !(await verifyAdminToken(token, secret))) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next();
  }

  // The board.
  const secret = process.env.APP_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!secret || (await verifySessionToken(token, secret)) === null) {
    // No separate login page: a logged-out board visit lands on the get-started
    // funnel, which explains how to get in (message the bot, tap its board link).
    return NextResponse.redirect(new URL("/get-started", req.url));
  }
  return NextResponse.next();
}

// Protect the board and the ops console; leave the login pages, API routes,
// static files, the tokenized referee pages, and the public marketing pages
// (landing + get-started) open. `referee` is excluded because a referee has no
// board password — the signed token in the URL is their auth. `landing` and
// `get-started` are the logged-out funnel, so they sit outside the gate. The
// `.*\..*` clause skips anything with a file extension (e.g. /logo.png) so public
// assets aren't redirected to /login — that was breaking the login logo.
// /admin is matched (not excluded) and handled by the admin branch above.
export const config = {
  matcher: ["/((?!login|api|referee|landing|get-started|_next|.*\\..*).*)"],
};
