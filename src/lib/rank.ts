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

export const CATEGORIES: Record<Category, { label: string; dot: string }> = {
  personal: { label: "Life", dot: "#7f77dd" },
  finance: { label: "Money", dot: "#1d9e75" },
  fitness: { label: "Body", dot: "#d85a30" },
  work: { label: "Work", dot: "#378add" },
  business: { label: "Build", dot: "#d4537e" },
  learning: { label: "Brain", dot: "#888780" },
};

// Single user, based in Hong Kong. HK has no daylight saving, so a fixed
// +8 offset is exact. All day-boundary math runs in HKT regardless of the
// server timezone (Vercel runs UTC) so "due today" never drifts by a day.
const HK_OFFSET = 8 * 60 * 60 * 1000;

const startOfDayHKT = (d: Date) =>
  new Date(Math.floor((d.getTime() + HK_OFFSET) / DAY) * DAY - HK_OFFSET);

export const isoHKT = (d: Date) => new Date(d.getTime() + HK_OFFSET).toISOString().slice(0, 10);

// Did you tap "I'll do it today" earlier today (HKT)? The evening check uses
// this to call out a promise you made this morning and haven't kept.
export function promisedToday(item: Item, now: Date): boolean {
  return (
    !!item.promisedAt &&
    startOfDayHKT(item.promisedAt).getTime() === startOfDayHKT(now).getTime()
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// HKT calendar parts of an instant.
const hktYMD = (d: Date) => {
  const s = new Date(d.getTime() + HK_OFFSET);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth(), day: s.getUTCDate() };
};

// The instant at 09:00 HKT (= 01:00 UTC) on a given HKT calendar date, matching
// how deadlines are stored.
const hktAt9 = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day, 1, 0, 0));

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// When a commitment is next due: its anchor (last honored, or created if never)
// plus one cadence period, calendar-accurate. Weekly lands on the same weekday;
// monthly keeps the same day-of-month, clamped to the target month's length so
// 31 Jan -> 28 Feb. Keys off lastDoneAt, not lastNudgedAt, so nudging never
// resets the clock and honoring a cycle pushes the due date out by a full period.
export function commitmentDue(item: Item): Date {
  const { y, m, day } = hktYMD(item.lastDoneAt ?? item.createdAt);
  if (item.cadence === "daily") return hktAt9(y, m, day + 1);
  if (item.cadence === "weekly") return hktAt9(y, m, day + 7);
  const nm = m + 1;
  const year = y + Math.floor(nm / 12);
  const month = ((nm % 12) + 12) % 12;
  return hktAt9(year, month, Math.min(day, daysInMonth(year, month)));
}

// One more period past the due date: the "you skipped a whole extra cycle" line.
const commitmentCriticalAt = (item: Item): Date =>
  commitmentDue({ ...item, lastDoneAt: commitmentDue(item) } as Item);

// Calendar days (HKT) the current cycle is past due. Negative = not due yet.
const overdueDaysCommit = (item: Item, now: Date) =>
  Math.round((startOfDayHKT(now).getTime() - startOfDayHKT(commitmentDue(item)).getTime()) / DAY);

// How early a commitment starts "heating up" before its due date.
const soonLead = (cadence: string | null) =>
  cadence === "monthly" ? 7 : cadence === "daily" ? 1 : 2;

const pastCommit = (item: Item, now: Date, at: Date) =>
  startOfDayHKT(now).getTime() >= startOfDayHKT(at).getTime();

export function rankScore(item: Item, now: Date): number {
  if (item.type === "parking") return -1;

  let s = item.important ? 40 : 15;
  if (item.urgent) s += 10;

  if (item.type === "commitment") {
    if (pastCommit(item, now, commitmentCriticalAt(item))) return s + 50;
    return s + (overdueDaysCommit(item, now) >= 0 ? 40 : 5);
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
    const od = overdueDaysCommit(item, now);
    if (od >= 0) return "burning";
    if (od >= -soonLead(item.cadence)) return "soon";
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
  if (item.type === "commitment") return overdueDaysCommit(item, now);
  if (!item.deadline) return -Infinity;
  return Math.round(
    (startOfDayHKT(now).getTime() - startOfDayHKT(item.deadline).getTime()) / DAY
  );
}

// The accountability trigger: blunt copy + referee-first buttons.
// Tasks 3+ days overdue, or a commitment that has missed a full extra cycle.
export function isCritical(item: Item, now: Date): boolean {
  if (item.type === "commitment") return pastCommit(item, now, commitmentCriticalAt(item));
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

// A commitment's due date is computed from cadence (never typed). Shows the date
// so "on fire" always has a visible reason: "due 19 Jul", "due 19 Jul · 3d overdue".
export function commitmentDueLabel(item: Item, now: Date): string {
  const due = commitmentDue(item);
  const { m, day } = hktYMD(due);
  const date = `${day} ${MONTHS[m]}`;
  const od = overdueDaysCommit(item, now);
  if (od > 0) return `due ${date} · ${od}d overdue`;
  if (od === 0) return `due ${date} · today`;
  return `due ${date}`;
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
