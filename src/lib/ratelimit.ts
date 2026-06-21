import { prisma } from "./db";

// DB-backed brute-force guard for login routes. A serverless function's memory
// resets between invocations and isn't shared across instances, so an in-memory
// counter wouldn't actually limit anything on Vercel — the count lives in the DB.

const WINDOW_MS = 15 * 60 * 1000; // look back 15 minutes
const MAX_FAILURES = 8; // failures within the window before lockout

export type LoginKind = "admin" | "board";

// Vercel sets x-forwarded-for; take the first hop (the real client). Falls back
// so a missing header can't throw — the password is still the real gate.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// True when this IP has too many recent failures for this login. Fails OPEN on a
// DB error: the limiter is defense in depth, and the secret check still protects
// the route, so a DB hiccup must not lock the real owner out.
export async function isLockedOut(ip: string, kind: LoginKind): Promise<boolean> {
  try {
    const since = new Date(Date.now() - WINDOW_MS);
    const fails = await prisma.loginAttempt.count({
      where: { ip, kind, success: false, createdAt: { gte: since } },
    });
    return fails >= MAX_FAILURES;
  } catch {
    return false;
  }
}

// Best-effort: a logging failure must never block a legitimate login.
export async function recordAttempt(
  ip: string,
  kind: LoginKind,
  success: boolean
): Promise<void> {
  try {
    await prisma.loginAttempt.create({ data: { ip, kind, success } });
  } catch {
    // intentionally silent
  }
}
