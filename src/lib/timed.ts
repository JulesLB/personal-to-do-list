import type { InlineKeyboard } from "./telegram";
import { deadlineLabel, timeHKT } from "./rank";
import type { Item } from "@prisma/client";

// M8 deadline-aware nudges. An item can carry a precise `dueAt` instant (set
// alongside the day-anchor `deadline`) and gets ONE focused ping at that moment,
// on top of the morning/evening digests. Pure logic only — no DB, no Telegram —
// so it unit-tests against a fixed clock like rank.ts / nudge.ts.

const HOUR = 60 * 60 * 1000;

// A timed ping is only valid inside a short window opening at dueAt. The grace
// covers a checker that wakes every ~15 min, so a ping isn't missed between ticks;
// anything older than the grace is left to the next digest rather than firing a
// stale "due now" hours late. (A downed scheduler degrades to the digest.)
export const TIMED_GRACE_MS = HOUR;

// Is this item's timed ping due right now? Open, has a dueAt, not already pinged
// (dueNudgedAt), not under an active snooze, and now is within [dueAt, dueAt+grace].
export function isTimedNudgeDue(
  item: Item,
  now: Date,
  graceMs: number = TIMED_GRACE_MS
): boolean {
  if (item.status !== "open" || !item.dueAt || item.dueNudgedAt) return false;
  if (item.snoozeUntil && item.snoozeUntil > now) return false;
  const t = item.dueAt.getTime();
  return now.getTime() >= t && now.getTime() <= t + graceMs;
}

export type TimedNudge = { text: string; keyboard: InlineKeyboard };

// A single-item ping with one tick. The tick uses a distinct `tdone:` callback so
// the webhook confirms in place instead of re-rendering the whole daily digest.
export function buildTimedNudge(item: Item, now: Date): TimedNudge {
  const when = item.dueAt ? timeHKT(item.dueAt) : null;
  const lead = item.deadline ? deadlineLabel(item.deadline, now) : null;
  // "due today" is implied by the ping firing now, so prefer the clock time.
  const meta = [when, lead && lead !== "due today" ? lead : null].filter(Boolean).join(" · ");
  const text = `⏰ Reminder: ${item.title}${meta ? `\n${meta}` : ""}`;
  return {
    text,
    keyboard: { inline_keyboard: [[{ text: "✓ Done", callback_data: `tdone:${item.id}` }]] },
  };
}
