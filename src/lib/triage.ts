import type { Item } from "@prisma/client";
import { isStaleParking } from "./rank";

// The slipping-item buckets, hottest first. "escalated" means the referee was
// actually told (a real consequence is live); the rest grade down through "you keep
// dodging" → "it's rotting undated". An item lands in the single most severe bucket
// it qualifies for.
export type TriageBucket = "escalated" | "dodging" | "death_zone";

// How much each bucket stokes the fire. Escalation carries the most heat because
// a person outside the app is now involved.
export const BUCKET_WEIGHT: Record<TriageBucket, number> = {
  escalated: 4,
  dodging: 1.5,
  death_zone: 1,
};

export const BUCKET_ORDER: TriageBucket[] = ["escalated", "dodging", "death_zone"];

export type TriageEvent = { itemId: number; kind: string; createdAt: Date };

export type TriageEntry = { item: Item; bucket: TriageBucket };

export type Triage = {
  entries: TriageEntry[]; // open slipping items, deduped, priority-ordered
  heat: number; // summed bucket weights — drives the bonfire's fury
  count: number;
};

export type FireTier = "out" | "warm" | "hot" | "inferno";

// The bonfire's intensity from total heat. "out" is the reward state: nothing is
// slipping, so the fire dies to embers.
export function fireTier(heat: number): FireTier {
  if (heat <= 0) return "out";
  if (heat <= 3) return "warm";
  if (heat <= 7) return "hot";
  return "inferno";
}

function bucketOf(item: Item, now: Date, escalated: Set<number>): TriageBucket | null {
  if (escalated.has(item.id)) return "escalated";
  if (item.deferCount >= 1) return "dodging";
  // An undated item left in parking past the stale threshold (7 days) is rotting:
  // it's the death zone, and it carries the board's "decide it or drop it" flag.
  if (isStaleParking(item, now)) return "death_zone";
  return null;
}

export function triage(items: Item[], events: TriageEvent[], now: Date): Triage {
  // An item is "escalated" only if the referee was told *this cycle*. The cycle
  // anchor is lastDoneAt (honoring a commitment resets it) or createdAt, so an
  // old send on a since-revived item doesn't keep it flagged forever.
  const lastTold = new Map<number, Date>();
  for (const e of events) {
    if (e.kind !== "told_referee") continue;
    const prev = lastTold.get(e.itemId);
    if (!prev || e.createdAt > prev) lastTold.set(e.itemId, e.createdAt);
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const escalated = new Set<number>();
  for (const [id, when] of lastTold) {
    const it = byId.get(id);
    if (it && when > (it.lastDoneAt ?? it.createdAt)) escalated.add(id);
  }

  const entries: TriageEntry[] = [];
  for (const item of items) {
    if (item.status !== "open") continue;
    const bucket = bucketOf(item, now, escalated);
    if (bucket) entries.push({ item, bucket });
  }
  entries.sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket));
  const heat = entries.reduce((s, e) => s + BUCKET_WEIGHT[e.bucket], 0);
  return { entries, heat, count: entries.length };
}
