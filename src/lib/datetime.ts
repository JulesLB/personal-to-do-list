// Timezone-aware date core (PRD-18). Every day/deadline calculation in the app
// runs through these helpers so "due today", heat, overdue, streak, and nudge
// timing follow the user's own calendar instead of a fixed Hong Kong offset.
//
// The app was single-user / fixed UTC+8 before this; DEFAULT_TZ keeps that exact
// behavior for any caller (and every existing test) that doesn't pass a zone.
// Intl handles DST correctly, which the old fixed-offset math could not.

export const DEFAULT_TZ = "Asia/Hong_Kong";

const DAY = 86400000;
const MINUTE = 60000;

// Intl.DateTimeFormat is expensive to construct; one per zone, reused.
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    fmtCache.set(tz, f);
  }
  return f;
}

// Is this a real IANA zone the runtime knows? Used to validate a `/tz` command
// before storing it. Intl throws RangeError on an unknown zone.
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type LocalParts = { y: number; m: number; day: number; hour: number; minute: number };

// The wall-clock calendar parts of an instant in a given zone (month 0-based).
export function partsInTz(d: Date, tz: string): LocalParts {
  const parts = dtf(tz).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some engines emit 24 at midnight under hour12:false
  return {
    y: parseInt(get("year"), 10),
    m: parseInt(get("month"), 10) - 1,
    day: parseInt(get("day"), 10),
    hour,
    minute: parseInt(get("minute"), 10),
  };
}

// The zone's offset (ms, local wall-clock minus UTC) at instant d. Derived by
// asking what wall-clock the zone shows for d and diffing against d itself.
function offsetAt(d: Date, tz: string): number {
  const p = partsInTz(d, tz);
  const asUTC = Date.UTC(p.y, p.m, p.day, p.hour, p.minute);
  return asUTC - Math.floor(d.getTime() / MINUTE) * MINUTE;
}

// The UTC instant of a given local wall-clock (y, m, day, hour, minute) in tz.
// Corrects once for a DST edge crossed between the guess and the result.
export function instantAtLocal(
  y: number,
  m: number,
  day: number,
  hour: number,
  minute: number,
  tz: string
): Date {
  const guess = Date.UTC(y, m, day, hour, minute);
  const off1 = offsetAt(new Date(guess), tz);
  const off2 = offsetAt(new Date(guess - off1), tz);
  return new Date(guess - off2);
}

// Integer index of the local calendar day (date floored to its zone). Differences
// between two of these are exact calendar-day counts, DST-safe (we count dates,
// not elapsed milliseconds).
export function dayNumber(d: Date, tz: string = DEFAULT_TZ): number {
  const { y, m, day } = partsInTz(d, tz);
  return Math.floor(Date.UTC(y, m, day) / DAY);
}

// The UTC instant of local midnight that starts d's local day. Used as a DB query
// boundary ("events since the start of today").
export function startOfDay(d: Date, tz: string = DEFAULT_TZ): Date {
  const { y, m, day } = partsInTz(d, tz);
  return instantAtLocal(y, m, day, 0, 0, tz);
}

// ISO YYYY-MM-DD of the instant's local date.
export function isoDate(d: Date, tz: string = DEFAULT_TZ): string {
  const { y, m, day } = partsInTz(d, tz);
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// HH:MM (24h) of the instant in local time.
export function timeOfDay(d: Date, tz: string = DEFAULT_TZ): string {
  const { hour, minute } = partsInTz(d, tz);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// Local hour 0-23, for the nudge tick's "is it 8am where they are?" gate.
export function hourInTz(d: Date, tz: string = DEFAULT_TZ): number {
  return partsInTz(d, tz).hour;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Local weekday name. Derived from the local calendar date (Date.UTC of the parts
// is the same date at UTC midnight, whose getUTCDay is the right weekday).
export function weekdayName(d: Date, tz: string = DEFAULT_TZ): string {
  const { y, m, day } = partsInTz(d, tz);
  return WEEKDAYS[new Date(Date.UTC(y, m, day)).getUTCDay()];
}

// A human "now" for the classifier: local date, clock time, weekday, and the zone
// name, so the router resolves "tomorrow", "Friday", "in 2 hours" against the
// user's own clock.
export function nowLabel(d: Date, tz: string = DEFAULT_TZ): string {
  return `${isoDate(d, tz)} ${timeOfDay(d, tz)} (${weekdayName(d, tz)}) ${tz}`;
}

// The stored instant for a date-only deadline: 09:00 local time on that date.
// Keeps the long-standing "deadlines live at 09:00" convention, now per-zone.
export function deadlineInstant(isoDay: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, day] = isoDay.split("-").map(Number);
  return instantAtLocal(y, m - 1, day, 9, 0, tz);
}

// The stored instant for a precise timed ping: HH:MM local on the given date.
export function timeInstant(isoDay: string, hhmm: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, day] = isoDay.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  return instantAtLocal(y, m - 1, day, hour, minute, tz);
}
