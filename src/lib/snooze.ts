// Snooze boundaries, computed in HKT (UTC+8, no DST) like the rest of the app.
// Pure and clock-injectable so the day-of-week math is unit-testable.

const HK_OFFSET = 8 * 60 * 60 * 1000;

export type SnoozePreset = "tonight" | "tomorrow" | "weekend" | "nextweek";

export const SNOOZE_PRESETS: SnoozePreset[] = ["tonight", "tomorrow", "weekend", "nextweek"];

type HktParts = { y: number; mo: number; d: number; wd: number; h: number };

const hktParts = (now: Date): HktParts => {
  const s = new Date(now.getTime() + HK_OFFSET);
  return {
    y: s.getUTCFullYear(),
    mo: s.getUTCMonth(),
    d: s.getUTCDate(),
    wd: s.getUTCDay(),
    h: s.getUTCHours(),
  };
};

// The UTC instant for HKT wall-clock (p.d + addDays) at the given HKT hour.
// Date.UTC normalises the negative (hour - 8) and any month overflow.
const hktAt = (p: HktParts, addDays: number, hour: number): Date =>
  new Date(Date.UTC(p.y, p.mo, p.d + addDays, hour - 8, 0, 0));

// Each boundary lands just before its cron: 08:00 precedes the 09:00 morning
// sweep, 20:00 precedes the 21:00 evening sweep, so the item resurfaces on it.
export function snoozeUntil(preset: SnoozePreset, now: Date): Date {
  const p = hktParts(now);
  switch (preset) {
    case "tonight":
      return p.h < 20 ? hktAt(p, 0, 20) : hktAt(p, 1, 8);
    case "tomorrow":
      return hktAt(p, 1, 8);
    case "weekend":
      // Days until the coming Saturday; if today is Saturday, a week out.
      return hktAt(p, ((6 - p.wd + 7) % 7) || 7, 8);
    case "nextweek":
      // Days until the coming Monday; if today is Monday, a week out.
      return hktAt(p, ((1 - p.wd + 7) % 7) || 7, 8);
  }
}

const LABELS: Record<SnoozePreset, string> = {
  tonight: "tonight",
  tomorrow: "tomorrow",
  weekend: "this weekend",
  nextweek: "next week",
};

export const isSnoozePreset = (s: string): s is SnoozePreset => s in LABELS;
export const snoozeLabel = (preset: SnoozePreset): string => LABELS[preset];
