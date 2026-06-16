import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const key = String(form.get("key") ?? "");

  if (key && key === process.env.APP_SECRET) {
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.set("app_auth", key, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }
  return NextResponse.redirect(new URL("/login?error=1", req.url));
}
