import type { Item } from "@prisma/client";
import { DEFAULT_TZ, dayNumber, isoDate, instantAtLocal, partsInTz } from "./datetime";

const DAY = 24 * 60 * 60 * 1000;

export type Heat = "burning" | "soon" | "later";

// All day-boundary math runs in the caller's timezone (PRD-18), defaulting to
// Hong Kong so any caller that doesn't pass a zone keeps the original behavior.
// dayNumber gives a DST-safe calendar-day index, so differences below are exact
// day counts regardless of the server timezone (Vercel runs UTC).

// Did you tap "I'll do it today" earlier today (the user's local day)? The evening
// check uses this to call out a promise made this morning and not yet kept.
export function promisedToday(item: Item, now: Date, tz: string = DEFAULT_TZ): boolean {
  return (
    !!item.promisedAt && dayNumber(item.promisedAt, tz) === dayNumber(now, tz)
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Local calendar parts of an instant.
const ymd = (d: Date, tz: string) => {
  const p = partsInTz(d, tz);
  return { y: p.y, m: p.m, day: p.day };
};

// The instant at 09:00 local time on a given calendar date, matching how
// date-only deadlines are stored.
const at9 = (y: number, m: number, day: number, tz: string) => instantAtLocal(y, m, day, 9, 0, tz);

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

// The k-th scheduled occurrence counting from a base calendar day (k = 0 is the
// base day itself), calendar-accurate and drift-free: monthly re-derives from the
// original day-of-month every step, so a run anchored on the 31st stays on the
// 31st (clamped per short month, 31 Jan -> 28 Feb) instead of walking back to the
// 28th and staying there; weekly steps the weekday by sevens; daily by ones.
function cadenceOccurrence(
  base: { y: number; m: number; day: number },
  cadence: string | null,
  k: number,
  tz: string
): Date {
  if (cadence === "daily") return at9(base.y, base.m, base.day + k, tz);
  if (cadence === "weekly") return at9(base.y, base.m, base.day + 7 * k, tz);
  const month = base.m + k;
  const year = base.y + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return at9(year, m, Math.min(base.day, daysInMonth(year, m)), tz);
}

// When a commitment is next due. The day-of-month / weekday is anchored on the
// stored deadline (what you actually committed to), so honoring a cycle a few days
// late doesn't drift the date off the 1st. A not-yet-honored commitment sits on
// its deadline as-is (honestly overdue once it passes); once honored it rolls to
// the first occurrence after lastDoneAt. Keys off lastDoneAt, not lastNudgedAt, so
// nudging never resets the clock. Legacy rows with no deadline keep the original
// behavior: one cadence period past the last completion (or creation).
export function commitmentDue(item: Item, tz: string = DEFAULT_TZ): Date {
  if (item.deadline) {
    const base = ymd(item.deadline, tz);
    let k = 0;
    let due = cadenceOccurrence(base, item.cadence, 0, tz);
    // Advance only once honored, to the first occurrence strictly after it. The
    // guard is a safety cap; in practice k is 0 (not yet done) or 1 (done on time).
    while (item.lastDoneAt && due.getTime() <= item.lastDoneAt.getTime() && k < 2400) {
      k += 1;
      due = cadenceOccurrence(base, item.cadence, k, tz);
    }
    return due;
  }
  return cadenceOccurrence(ymd(item.lastDoneAt ?? item.createdAt, tz), item.cadence, 1, tz);
}

// One more period past the due date: the "you skipped a whole extra cycle" line.
const commitmentCriticalAt = (item: Item, tz: string): Date =>
  commitmentDue({ ...item, lastDoneAt: commitmentDue(item, tz) } as Item, tz);

// Calendar days the current cycle is past due. Negative = not due yet.
const overdueDaysCommit = (item: Item, now: Date, tz: string) =>
  dayNumber(now, tz) - dayNumber(commitmentDue(item, tz), tz);

// How early a commitment starts "heating up" before its due date.
const soonLead = (cadence: string | null) =>
  cadence === "monthly" ? 7 : cadence === "daily" ? 1 : 2;

const pastCommit = (item: Item, now: Date, at: Date, tz: string) =>
  dayNumber(now, tz) >= dayNumber(at, tz);

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
// decides between two items that fall on the SAME calendar day. Nothing else
// enters the sort. A task's date is its deadline, a commitment's is its computed
// due date (see effectiveDate); parking is excluded upstream.
export function compareActionable(a: Item, b: Item, tz: string = DEFAULT_TZ): number {
  const da = effectiveDay(a, tz);
  const db = effectiveDay(b, tz);
  if (da !== db) return da - db; // earlier date is more urgent
  if (a.important !== b.important) return a.important ? -1 : 1; // important breaks the tie
  return a.id - b.id; // stable
}

// Color tone for the due label specifically. Tighter than the band heat: today
// AND tomorrow read as burning (red), 2–3 days as soon (amber), the rest calm.
// So "due tomorrow" is red even while the item still sits in the "Heating up"
// band. Commitments key off their computed due date.
export function dueTone(item: Item, now: Date, tz: string = DEFAULT_TZ): Heat {
  const target = item.type === "commitment" ? commitmentDue(item, tz) : item.deadline;
  if (!target) return "later";
  const cal = dayNumber(target, tz) - dayNumber(now, tz);
  if (cal <= 1) return "burning";
  if (cal <= 3) return "soon";
  return "later";
}

export function heatOf(item: Item, now: Date, tz: string = DEFAULT_TZ): Heat {
  if (item.type === "commitment") {
    const od = overdueDaysCommit(item, now, tz);
    if (od >= 0) return "burning";
    if (od >= -soonLead(item.cadence)) return "soon";
    return "later";
  }
  if (!item.deadline) return "later";
  const cal = dayNumber(item.deadline, tz) - dayNumber(now, tz);
  if (cal <= 0) return "burning";
  if (cal <= 3) return "soon";
  return "later";
}

// Positive = past due. Tasks: calendar days past the deadline. Commitments: days
// drifted beyond one cadence period. -Infinity = not applicable.
export function daysOverdue(item: Item, now: Date, tz: string = DEFAULT_TZ): number {
  if (item.type === "commitment") return overdueDaysCommit(item, now, tz);
  if (!item.deadline) return -Infinity;
  return dayNumber(now, tz) - dayNumber(item.deadline, tz);
}

// The accountability trigger: blunt copy + referee-first buttons.
// Tasks 3+ days overdue, or a commitment that has missed a full extra cycle.
export function isCritical(item: Item, now: Date, tz: string = DEFAULT_TZ): boolean {
  if (item.type === "commitment") return pastCommit(item, now, commitmentCriticalAt(item, tz), tz);
  return item.type === "task" && !!item.deadline && daysOverdue(item, now, tz) >= 3;
}

export function deadlineLabel(deadline: Date | null, now: Date, tz: string = DEFAULT_TZ): string | null {
  if (!deadline) return null;
  const cal = dayNumber(deadline, tz) - dayNumber(now, tz);
  if (cal < 0) return `${-cal}d overdue`;
  if (cal === 0) return "due today";
  if (cal === 1) return "due tomorrow";
  if (cal <= 7) return `due in ${cal} days`;
  return `due ${isoDate(deadline, tz)}`;
}

// Like deadlineLabel but always expressed in days, even past a week. The board
// rows want "due in 12 days", not an ISO date. Negative = overdue.
export function dueInLabel(deadline: Date | null, now: Date, tz: string = DEFAULT_TZ): string | null {
  if (!deadline) return null;
  const cal = dayNumber(deadline, tz) - dayNumber(now, tz);
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
export function commitmentDueLabel(item: Item, now: Date, tz: string = DEFAULT_TZ): string {
  const due = commitmentDue(item, tz);
  const { m, day } = ymd(due, tz);
  const date = `${day} ${MONTHS[m]}`;
  const od = overdueDaysCommit(item, now, tz);
  if (od > 0) return `due ${date} · ${od}d overdue`;
  if (od === 0) return `due ${date} · today`;
  return `due ${date}`;
}

// How many times you actively pushed an item away. Snoozing or shoving the
// deadline later both count (bumped at the mutation site); this reads the tally.
// One bit of signal — "you keep dodging this" — shown the same way regardless of
// count. Visible from the first push so a single postpone isn't invisible.
export function deferState(item: Item): { count: number } | null {
  const n = item.deferCount;
  if (n < 1) return null;
  return { count: n };
}

// Parking is the undated drawer. Show how long something's sat there so a rotting
// idea is visible, and flag it past the threshold so it forces a decision. Past
// this many days an undated item is rotting: it drives both the board's "decide it"
// flag and the Review's death zone.
export const STALE_PARKING_DAYS = 7;

export function ageDays(createdAt: Date, now: Date, tz: string = DEFAULT_TZ): number {
  return dayNumber(now, tz) - dayNumber(createdAt, tz);
}

export function parkingAgeLabel(createdAt: Date, now: Date, tz: string = DEFAULT_TZ): string {
  const d = ageDays(createdAt, now, tz);
  if (d <= 0) return "added today";
  if (d === 1) return "added yesterday";
  return `added ${d}d ago`;
}

export function isStaleParking(item: Item, now: Date, tz: string = DEFAULT_TZ): boolean {
  return item.type === "parking" && ageDays(item.createdAt, now, tz) >= STALE_PARKING_DAYS;
}

// The date an item is "about": a task's deadline, a commitment's computed due.
const effectiveDate = (item: Item, tz: string): number =>
  item.type === "commitment"
    ? commitmentDue(item, tz).getTime()
    : item.deadline?.getTime() ?? Infinity;

// That date as its calendar-day index, so "due on the same day" compares equal
// regardless of the stored time-of-day. Infinity (undated) stays last.
const effectiveDay = (item: Item, tz: string): number => {
  const t = effectiveDate(item, tz);
  return Number.isFinite(t) ? dayNumber(new Date(t), tz) : Infinity;
};

// Every list uses the same order: date first, importance second. (Was a
// separate date-only sort; folded into the one comparator so the calm bands
// can't disagree with the hero / On-fire order.)
export function sortByDate(rows: Ranked[], tz: string = DEFAULT_TZ): Ranked[] {
  return [...rows].sort((a, b) => compareActionable(a.item, b.item, tz));
}

export type Ranked = { item: Item; heat: Heat };

export function rankActionable(items: Item[], now: Date, tz: string = DEFAULT_TZ): Ranked[] {
  return items
    .filter((i) => i.type !== "parking")
    .map((item) => ({ item, heat: heatOf(item, now, tz) }))
    .sort((a, b) => compareActionable(a.item, b.item, tz));
}
