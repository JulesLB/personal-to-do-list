// Snooze boundaries, computed in the user's local timezone (PRD-18, default Hong
// Kong). Pure and clock-injectable so the day-of-week math is unit-testable.

import { DEFAULT_TZ, instantAtLocal, partsInTz } from "./datetime";

export type SnoozePreset = "tonight" | "tomorrow" | "weekend" | "nextweek";

export const SNOOZE_PRESETS: SnoozePreset[] = ["tonight", "tomorrow", "weekend", "nextweek"];

type LocalParts = { y: number; mo: number; d: number; wd: number; h: number };

const localParts = (now: Date, tz: string): LocalParts => {
  const p = partsInTz(now, tz);
  // Weekday from the local calendar date (UTC-midnight of those parts has the
  // matching getUTCDay).
  const wd = new Date(Date.UTC(p.y, p.m, p.day)).getUTCDay();
  return { y: p.y, mo: p.m, d: p.day, wd, h: p.hour };
};

// The instant for local wall-clock (p.d + addDays) at the given local hour.
const localAt = (p: LocalParts, addDays: number, hour: number, tz: string): Date =>
  instantAtLocal(p.y, p.mo, p.d + addDays, hour, 0, tz);

// Each boundary lands just before its digest: 08:00 precedes the morning sweep,
// 20:00 precedes the evening sweep, so the item resurfaces on it.
export function snoozeUntil(preset: SnoozePreset, now: Date, tz: string = DEFAULT_TZ): Date {
  const p = localParts(now, tz);
  switch (preset) {
    case "tonight":
      return p.h < 20 ? localAt(p, 0, 20, tz) : localAt(p, 1, 8, tz);
    case "tomorrow":
      return localAt(p, 1, 8, tz);
    case "weekend":
      // Days until the coming Saturday; if today is Saturday, a week out.
      return localAt(p, ((6 - p.wd + 7) % 7) || 7, 8, tz);
    case "nextweek":
      // Days until the coming Monday; if today is Monday, a week out.
      return localAt(p, ((1 - p.wd + 7) % 7) || 7, 8, tz);
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
