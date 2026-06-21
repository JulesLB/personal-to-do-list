import type { Item } from "@prisma/client";
import { prisma } from "./db";
import { generateAnalysis, type CoachAnalysis } from "./coach";

const KEY = "reviewAnalysis";

type Events = { itemId: number; kind: string; createdAt: Date }[];

async function store(a: CoachAnalysis): Promise<void> {
  const value = JSON.stringify(a);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

// Read the cached read, generating one only if none exists yet. Freshness is the
// user's call via the refresh button, so a page load never silently pays for an
// API call (or its latency) on its own. A model/API failure degrades to null so
// the page still renders — the coach card just doesn't show.
export async function loadAnalysis(
  items: Item[],
  events: Events,
  now: Date
): Promise<CoachAnalysis | null> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (row) {
    try {
      const a = JSON.parse(row.value) as Partial<CoachAnalysis>;
      // Only trust a cache in the current shape. An older read (read/plan/patterns)
      // parses fine but has none of these fields, so we regenerate instead of
      // rendering a blank card.
      if (typeof a.pattern === "string" && typeof a.doThis === "string") {
        return a as CoachAnalysis;
      }
    } catch {
      // fall through and regenerate over a corrupt cache
    }
  }
  return forceAnalysis(items, events, now);
}

// Regenerate on demand (the Refresh button / a future cron). Swallows failures so
// a transient API error never throws inside a server action.
export async function forceAnalysis(
  items: Item[],
  events: Events,
  now: Date
): Promise<CoachAnalysis | null> {
  try {
    const a = await generateAnalysis(items, events, now);
    await store(a);
    return a;
  } catch {
    return null;
  }
}
