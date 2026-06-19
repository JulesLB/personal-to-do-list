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

// Type is never set by hand: it falls out of the date controls. A cadence means
// it repeats (commitment); a one-off date is a task; neither is parked. So the
// only thing you set is a deadline and/or "repeats", and the type follows.
export function deriveType(
  deadline: Date | null,
  cadence: string | null
): "task" | "commitment" | "parking" {
  if (cadence) return "commitment";
  if (deadline) return "task";
  return "parking";
}

// Ordering is strictly lexicographic: date first, importance second. The
// soonest (or most overdue) due date always wins outright; importance only
// decides between two items that fall on the SAME calendar day (HKT). Nothing
// else enters the sort. A task's date is its deadline, a commitment's is its
// computed due date (see effectiveDate); parking is excluded upstream.
export function compareActionable(a: Item, b: Item): number {
  const da = effectiveDayHKT(a);
  const db = effectiveDayHKT(b);
  if (da !== db) return da - db; // earlier date is more urgent
  if (a.important !== b.important) return a.important ? -1 : 1; // important breaks the tie
  return a.id - b.id; // stable
}

// Color tone for the due label specifically. Tighter than the band heat: today
// AND tomorrow read as burning (red), 2–3 days as soon (amber), the rest calm.
// So "due tomorrow" is red even while the item still sits in the "Heating up"
// band. Commitments key off their computed due date.
export function dueTone(item: Item, now: Date): Heat {
  const target = item.type === "commitment" ? commitmentDue(item) : item.deadline;
  if (!target) return "later";
  const cal = Math.round((startOfDayHKT(target).getTime() - startOfDayHKT(now).getTime()) / DAY);
  if (cal <= 1) return "burning";
  if (cal <= 3) return "soon";
  return "later";
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

// How many times you actively pushed an item away. Snoozing or shoving the
// deadline later both count (bumped at the mutation site); this reads the tally
// and grades it: one push is an orange warning, two is red, three or more is red
// and animated. Visible from the first push so a single postpone isn't invisible.
export type DeferTier = "low" | "high" | "alarm";

export function deferState(item: Item): { count: number; tier: DeferTier } | null {
  const n = item.deferCount;
  if (n < 1) return null;
  return { count: n, tier: n >= 3 ? "alarm" : n === 2 ? "high" : "low" };
}

// Parking is the undated drawer. Show how long something's sat there so a rotting
// idea is visible, and flag it past the threshold so it forces a decision.
export const STALE_PARKING_DAYS = 14;

export function ageDaysHKT(createdAt: Date, now: Date): number {
  return Math.round(
    (startOfDayHKT(now).getTime() - startOfDayHKT(createdAt).getTime()) / DAY
  );
}

export function parkingAgeLabel(createdAt: Date, now: Date): string {
  const d = ageDaysHKT(createdAt, now);
  if (d <= 0) return "added today";
  if (d === 1) return "added yesterday";
  return `added ${d}d ago`;
}

export function isStaleParking(item: Item, now: Date): boolean {
  return item.type === "parking" && ageDaysHKT(item.createdAt, now) >= STALE_PARKING_DAYS;
}

// The date an item is "about": a task's deadline, a commitment's computed due.
const effectiveDate = (item: Item): number =>
  item.type === "commitment"
    ? commitmentDue(item).getTime()
    : item.deadline?.getTime() ?? Infinity;

// That date floored to its HKT calendar day, so "due on the same day" compares
// equal regardless of the stored time-of-day. Infinity (undated) stays last.
const effectiveDayHKT = (item: Item): number => {
  const t = effectiveDate(item);
  return Number.isFinite(t) ? startOfDayHKT(new Date(t)).getTime() : Infinity;
};

// Every list uses the same order: date first, importance second. (Was a
// separate date-only sort; folded into the one comparator so the calm bands
// can't disagree with the hero / On-fire order.)
export function sortByDate(rows: Ranked[]): Ranked[] {
  return [...rows].sort((a, b) => compareActionable(a.item, b.item));
}

export type Ranked = { item: Item; heat: Heat };

export function rankActionable(items: Item[], now: Date): Ranked[] {
  return items
    .filter((i) => i.type !== "parking")
    .map((item) => ({ item, heat: heatOf(item, now) }))
    .sort((a, b) => compareActionable(a.item, b.item));
}
