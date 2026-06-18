import type { Item } from "@prisma/client";

const DAY = 24 * 60 * 60 * 1000;

export type Heat = "burning" | "soon" | "later";

export type Category =
  | "personal"
  | "finance"
  | "fitness"
  | "work"
  | "business"
  | "learning";

export const CATEGORIES: Record<Category, { label: string; icon: string; dot: string }> = {
  personal: { label: "Life", icon: "🌿", dot: "#7f77dd" },
  finance: { label: "Money", icon: "💰", dot: "#1d9e75" },
  fitness: { label: "Body", icon: "💪", dot: "#d85a30" },
  work: { label: "Day Job", icon: "💼", dot: "#378add" },
  business: { label: "The Build", icon: "🚀", dot: "#d4537e" },
  learning: { label: "Brain", icon: "🧠", dot: "#888780" },
};

// Single user, based in Hong Kong. HK has no daylight saving, so a fixed
// +8 offset is exact. All day-boundary math runs in HKT regardless of the
// server timezone (Vercel runs UTC) so "due today" never drifts by a day.
const HK_OFFSET = 8 * 60 * 60 * 1000;

const startOfDayHKT = (d: Date) =>
  new Date(Math.floor((d.getTime() + HK_OFFSET) / DAY) * DAY - HK_OFFSET);

const isoHKT = (d: Date) => new Date(d.getTime() + HK_OFFSET).toISOString().slice(0, 10);

// Did you tap "I'll do it today" earlier today (HKT)? The evening check uses
// this to call out a promise you made this morning and haven't kept.
export function promisedToday(item: Item, now: Date): boolean {
  return (
    !!item.promisedAt &&
    startOfDayHKT(item.promisedAt).getTime() === startOfDayHKT(now).getTime()
  );
}

const cadenceDays = (cadence: string | null) =>
  cadence === "weekly" ? 7 : cadence === "daily" ? 1 : 30;

// Days since the commitment was last honored. Keys off lastDoneAt (not
// lastNudgedAt) so nudging a commitment never resets its overdue clock, and
// completing one cycle pushes the next due date out by a full period.
const sinceLastDone = (item: Item, now: Date) =>
  (now.getTime() - (item.lastDoneAt ?? item.createdAt).getTime()) / DAY;

// How far past the cadence period a commitment has drifted, in cycles.
// 1.0 = exactly one period elapsed (due now); 2.0 = a full extra cycle missed.
const cadenceProgress = (item: Item, now: Date) =>
  sinceLastDone(item, now) / cadenceDays(item.cadence);

export function rankScore(item: Item, now: Date): number {
  if (item.type === "parking") return -1;

  let s = item.important ? 40 : 15;
  if (item.urgent) s += 10;

  if (item.type === "commitment") {
    const p = cadenceProgress(item, now);
    return s + (p >= 2 ? 50 : p >= 1 ? 40 : 5);
  }

  if (item.deadline) {
    const days = (item.deadline.getTime() - now.getTime()) / DAY;
    if (days < 0) s += 50;
    else if (days < 1) s += 40;
    else if (days <= 2) s += 30;
    else if (days <= 7) s += 20;
    else s += 10;
  } else if (item.important) {
    s += 5;
  }
  return s;
}

export function heatOf(item: Item, now: Date): Heat {
  if (item.type === "commitment") {
    const p = cadenceProgress(item, now);
    if (p >= 1) return "burning";
    if (p >= 0.75) return "soon";
    return "later";
  }
  if (!item.deadline) return "later";
  const cal = (startOfDayHKT(item.deadline).getTime() - startOfDayHKT(now).getTime()) / DAY;
  if (cal <= 0) return "burning";
  if (cal <= 3) return "soon";
  return "later";
}

// Positive = past due. Tasks: calendar days past the deadline (HKT).
// Commitments: days drifted beyond one cadence period. -Infinity = not applicable.
export function daysOverdue(item: Item, now: Date): number {
  if (item.type === "commitment") {
    return Math.floor(sinceLastDone(item, now) - cadenceDays(item.cadence));
  }
  if (!item.deadline) return -Infinity;
  return Math.round(
    (startOfDayHKT(now).getTime() - startOfDayHKT(item.deadline).getTime()) / DAY
  );
}

// The accountability trigger: blunt copy + referee-first buttons.
// Tasks 3+ days overdue, or a commitment that has missed a full extra cycle.
export function isCritical(item: Item, now: Date): boolean {
  if (item.type === "commitment") return cadenceProgress(item, now) >= 2;
  return item.type === "task" && !!item.deadline && daysOverdue(item, now) >= 3;
}

export function deadlineLabel(deadline: Date | null, now: Date): string | null {
  if (!deadline) return null;
  const cal = Math.round(
    (startOfDayHKT(deadline).getTime() - startOfDayHKT(now).getTime()) / DAY
  );
  if (cal < 0) return `${-cal}d overdue`;
  if (cal === 0) return "due today";
  if (cal === 1) return "due tomorrow";
  if (cal <= 7) return `due in ${cal} days`;
  return `due ${isoHKT(deadline)}`;
}

// Like deadlineLabel but always expressed in days, even past a week. The board's
// category tiles want "due in 12 days", not an ISO date. Negative = overdue.
export function dueInLabel(deadline: Date | null, now: Date): string | null {
  if (!deadline) return null;
  const cal = Math.round(
    (startOfDayHKT(deadline).getTime() - startOfDayHKT(now).getTime()) / DAY
  );
  if (cal < 0) return `${-cal}d overdue`;
  if (cal === 0) return "due today";
  if (cal === 1) return "due tomorrow";
  return `due in ${cal} days`;
}

export function cadenceLabel(cadence: string | null): string | null {
  if (!cadence) return null;
  return cadence === "daily" ? "daily" : cadence === "weekly" ? "weekly" : "monthly";
}

export type Ranked = { item: Item; score: number; heat: Heat };

export function rankActionable(items: Item[], now: Date): Ranked[] {
  return items
    .filter((i) => i.type !== "parking")
    .map((item) => ({ item, score: rankScore(item, now), heat: heatOf(item, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.item.deadline?.getTime() ?? Infinity) - (b.item.deadline?.getTime() ?? Infinity)
    );
}
