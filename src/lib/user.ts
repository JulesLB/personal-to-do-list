import { prisma } from "./db";
import type { User } from "@prisma/client";

// PRD-10: a Telegram chat is the identity anchor. The bot resolves-or-creates the
// user behind a chat on first contact, replacing the old single-owner gate.
// M5: the chat payload's first name is harvested here so the classifier can
// personalize without ever asking; a genuinely new chat is stamped "new" so it
// gets the guided first run (existing users default to "done" via the schema).
export async function resolveUser(
  chatId: number | string,
  profile: { name?: string } = {}
): Promise<User> {
  const tg = String(chatId);
  const name = profile.name?.trim() || undefined;
  const existing = await prisma.user.findUnique({ where: { telegramChatId: tg } });
  if (existing) {
    // Backfill a missing name once we learn it; never overwrite a set one.
    if (name && !existing.name) {
      return prisma.user.update({ where: { id: existing.id }, data: { name } });
    }
    return existing;
  }
  // Reconcile the migration placeholder: if the backfilled owner still carries
  // the "pending-owner" stand-in (i.e. no ownerChatId was set at migration time),
  // adopt this chat into it so the backfilled items keep their owner instead of
  // spawning a second account. This is an existing user, so leave onboarding done.
  const placeholder = await prisma.user.findUnique({
    where: { telegramChatId: "pending-owner" },
  });
  if (placeholder) {
    return prisma.user.update({
      where: { id: placeholder.id },
      data: { telegramChatId: tg, ...(name && !placeholder.name ? { name } : {}) },
    });
  }
  return prisma.user.create({ data: { telegramChatId: tg, name, onboardingStep: "new" } });
}

// Board bridge until PRD-11 gives the board a real per-user session: the first
// (lowest-id) user, i.e. Jules. Every board surface scopes to this for now; swap
// it for the session user when PRD-11 lands. Returns null before any user exists.
export async function ownerUser(): Promise<User | null> {
  return prisma.user.findFirst({ orderBy: { id: "asc" } });
}

// The owner (Jules) is exempt from the bot's rate limit and monthly spend cap so
// testing isn't throttled. Owner = the lowest-id user, matching ownerUser(). A
// set OWNER_CHAT_ID env wins if present, so a reset DB can't hand the exemption to
// whoever messages first. Fails to false on a DB error: better to throttle the
// owner briefly than to silently exempt everyone.
export async function isOwnerUser(userId: number, chatId?: string | number): Promise<boolean> {
  const envOwner = process.env.OWNER_CHAT_ID?.trim();
  if (envOwner && chatId !== undefined) return String(chatId) === envOwner;
  try {
    const owner = await prisma.user.findFirst({ orderBy: { id: "asc" }, select: { id: true } });
    return owner?.id === userId;
  } catch {
    return false;
  }
}

// PRD-18: persist a user's timezone, set either silently from the board (the
// browser reports where their device is) or via the bot's `/tz` command. The
// caller validates the zone (isValidTimeZone) before this.
export async function setTimezone(userId: number, timezone: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { timezone } });
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
