// Pure helpers for the ops cost dashboard: HKT period boundaries and display
// formatting. All windows are HKT (UTC+8, no DST) to match the rest of the app,
// so "today" and "this month" line up with how Jules actually lives.

const HK_OFFSET = 8 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

// Start of today, HKT, as a UTC instant.
export function hktDayStart(now: Date): Date {
  return new Date(Math.floor((now.getTime() + HK_OFFSET) / DAY) * DAY - HK_OFFSET);
}

// Start of the current month, HKT, as a UTC instant.
export function hktMonthStart(now: Date): Date {
  const hk = new Date(now.getTime() + HK_OFFSET);
  return new Date(Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth(), 1) - HK_OFFSET);
}

// Start of the trailing 7-day window (today + 6 prior days), HKT. Matches how the
// weekly receipts count "this week".
export function hktWeekStart(now: Date): Date {
  return new Date(hktDayStart(now).getTime() - 6 * DAY);
}

// Cost is tiny (fractions of a cent), so 4 decimals keeps a single call visible
// instead of rounding it to $0.00.
export function fmtUsd(n: number | null | undefined): string {
  return `$${(n ?? 0).toFixed(4)}`;
}

export function fmtInt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-US");
}

// HKT timestamp for the recent-calls table, e.g. "21 Jun 14:03".
export function fmtWhenHKT(d: Date): string {
  return new Date(d.getTime() + HK_OFFSET)
    .toISOString()
    .replace("T", " ")
    .slice(0, 16);
}
