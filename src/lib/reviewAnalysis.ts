import type { Item } from "@prisma/client";
import { prisma } from "./db";
import { generateAnalysis, type CoachAnalysis } from "./coach";
import { overMonthlyBudget } from "./usage";
import { isOwnerUser } from "./user";

// Per-user cache key (PRD-11): one read per user, so two users never see each
// other's coaching. Legacy global "reviewAnalysis" rows simply go unread.
const keyFor = (userId: number) => `reviewAnalysis:${userId}`;

type Events = { itemId: number; kind: string; createdAt: Date }[];

async function store(userId: number, a: CoachAnalysis): Promise<void> {
  const key = keyFor(userId);
  const value = JSON.stringify(a);
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

// The coach is a weekly read, not a per-visit one: a cached analysis is reused
// for 7 days, so switching to Review repeatedly costs no tokens. A model/API
// failure degrades to null so the page still renders without the card.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Read the cache without ever blocking on the model. Returns whatever is cached
// (even a week-stale read) plus whether it's due a regeneration. The page renders
// instantly off this and schedules any regen with after(), so the multi-second
// Haiku call never sits in the request's critical path — that wait was the lag
// that made opening Review feel slow. The Refresh button still forces a fresh
// read on demand.
export async function readCachedAnalysis(
  userId: number,
  now: Date
): Promise<{ analysis: CoachAnalysis | null; stale: boolean }> {
  const row = await prisma.setting.findUnique({ where: { key: keyFor(userId) } });
  if (row) {
    try {
      const a = JSON.parse(row.value) as Partial<CoachAnalysis>;
      // Only trust a cache in the current shape. An older read (read/plan/patterns)
      // parses fine but has none of these fields, so we regenerate instead of
      // rendering a blank card.
      const validShape =
        typeof a.pattern === "string" &&
        typeof a.doThis === "string" &&
        typeof a.generatedAt === "string";
      if (validShape) {
        const fresh = now.getTime() - new Date(a.generatedAt as string).getTime() < WEEK_MS;
        return { analysis: a as CoachAnalysis, stale: !fresh };
      }
    } catch {
      // fall through: corrupt cache, treat as missing + stale
    }
  }
  return { analysis: null, stale: true };
}

// Regenerate on demand (the Refresh button / a future cron). Swallows failures so
// a transient API error never throws inside a server action.
export async function forceAnalysis(
  userId: number,
  items: Item[],
  events: Events,
  now: Date
): Promise<CoachAnalysis | null> {
  // Honor the monthly spend cap here too: the coach is a paid call, so a
  // non-owner who's hit their cap doesn't get a fresh read (the page falls back to
  // whatever's cached). The owner is exempt, same as the bot.
  if (!(await isOwnerUser(userId)) && (await overMonthlyBudget(userId, now))) return null;
  try {
    const a = await generateAnalysis(items, events, now, userId);
    await store(userId, a);
    return a;
  } catch {
    return null;
  }
}
