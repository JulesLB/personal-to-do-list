import { cookies } from "next/headers";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySessionToken } from "./auth";
import type { User } from "@prisma/client";

// PRD-11: who is logged into the board, read from the signed session cookie. The
// middleware already gate-keeps the board, but server components and actions need
// the actual user to scope their data — that's this. Returns null if no valid
// session (shouldn't happen behind the middleware, but the callers handle it).
export async function currentUser(): Promise<User | null> {
  const secret = process.env.APP_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = await verifySessionToken(token, secret);
  if (userId === null) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}
