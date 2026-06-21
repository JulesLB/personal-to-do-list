import { prisma } from "./db";
import type { User } from "@prisma/client";

// PRD-10: a Telegram chat is the identity anchor. The bot resolves-or-creates the
// user behind a chat on first contact, replacing the old single-owner gate.
export async function resolveUser(chatId: number | string): Promise<User> {
  const tg = String(chatId);
  const existing = await prisma.user.findUnique({ where: { telegramChatId: tg } });
  if (existing) return existing;
  // Reconcile the migration placeholder: if the backfilled owner still carries
  // the "pending-owner" stand-in (i.e. no ownerChatId was set at migration time),
  // adopt this chat into it so the backfilled items keep their owner instead of
  // spawning a second account.
  const placeholder = await prisma.user.findUnique({
    where: { telegramChatId: "pending-owner" },
  });
  if (placeholder) {
    return prisma.user.update({
      where: { id: placeholder.id },
      data: { telegramChatId: tg },
    });
  }
  return prisma.user.create({ data: { telegramChatId: tg } });
}

// Board bridge until PRD-11 gives the board a real per-user session: the first
// (lowest-id) user, i.e. Jules. Every board surface scopes to this for now; swap
// it for the session user when PRD-11 lands. Returns null before any user exists.
export async function ownerUser(): Promise<User | null> {
  return prisma.user.findFirst({ orderBy: { id: "asc" } });
}

// The referee labels a user has configured, for the classifier prompt + enum.
export async function refereeLabels(userId: number): Promise<string[]> {
  const refs = await prisma.referee.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    select: { label: true },
  });
  return refs.map((r) => r.label);
}
