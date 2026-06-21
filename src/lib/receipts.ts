import type { Item } from "@prisma/client";
import { currentStreak } from "./streak";

const DAY = 86400000;
const HK_OFFSET = 8 * 60 * 60 * 1000;
// Same HKT day-index as streak.ts: floor of the +8-shifted epoch into days, so a
// week boundary lands on the Hong Kong calendar, not the UTC server's.
const dayNum = (d: Date) => Math.floor((d.getTime() + HK_OFFSET) / DAY);

// The slice of Event the receipts read. Kept structural (not the Prisma row) so
// the module stays pure and unit-testable against plain fixtures.
export type ReceiptEvent = {
  itemId: number;
  kind: string;
  createdAt: Date;
};

export type WeekStats = {
  cleared: number; // done Events that landed in the window
  pushed: number; // snoozed Events in the window — times you shoved something away
  promised: number; // "I'll do it today" taps in the window
  kept: number; // of those, the ones done the same HKT day
  keptRate: number | null; // kept / promised, null when you promised nothing
};

export type Receipts = {
  streak: number;
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  mostPushed: { title: string; count: number } | null;
};

function statsFor(events: ReceiptEvent[], loDay: number, hiDay: number): WeekStats {
  const inWin = (d: Date) => {
    const n = dayNum(d);
    return n >= loDay && n <= hiDay;
  };
  // A promise is kept when the same item has a done Event on the same HKT day it
  // was promised. Pre-index every done by item+day so the lookup is a Set hit.
  const doneByItemDay = new Set(
    events.filter((e) => e.kind === "done").map((e) => `${e.itemId}:${dayNum(e.createdAt)}`)
  );
  const promisedEvents = events.filter((e) => e.kind === "promised" && inWin(e.createdAt));
  const kept = promisedEvents.filter((e) =>
    doneByItemDay.has(`${e.itemId}:${dayNum(e.createdAt)}`)
  ).length;
  const promised = promisedEvents.length;
  return {
    cleared: events.filter((e) => e.kind === "done" && inWin(e.createdAt)).length,
    pushed: events.filter((e) => e.kind === "snoozed" && inWin(e.createdAt)).length,
    promised,
    kept,
    keptRate: promised ? kept / promised : null,
  };
}

// The single item you shoved away most this week, by snoozed-Event count (not the
// all-time deferCount, so the panel is about *this* week). Ties resolve to the
// first item seen; a week with no pushes returns null.
function mostPushedThisWeek(
  events: ReceiptEvent[],
  items: Item[],
  loDay: number,
  hiDay: number
): { title: string; count: number } | null {
  const counts = new Map<number, number>();
  for (const e of events) {
    if (e.kind !== "snoozed") continue;
    const n = dayNum(e.createdAt);
    if (n < loDay || n > hiDay) continue;
    counts.set(e.itemId, (counts.get(e.itemId) ?? 0) + 1);
  }
  let topId: number | null = null;
  let top = 0;
  for (const [id, c] of counts) {
    if (c > top) {
      top = c;
      topId = id;
    }
  }
  if (topId === null) return null;
  const item = items.find((i) => i.id === topId);
  if (!item) return null;
  return { title: item.title, count: top };
}

// Pure weekly receipts: items + the Event log → the numbers the board panel and
// (later) the Sunday digest read back. Trailing 7 HKT days vs the 7 before.
export function weeklyReceipts(items: Item[], events: ReceiptEvent[], now: Date): Receipts {
  const today = dayNum(now);
  const dones = events.filter((e) => e.kind === "done");
  return {
    streak: currentStreak(items, dones, now),
    thisWeek: statsFor(events, today - 6, today),
    lastWeek: statsFor(events, today - 13, today - 7),
    mostPushed: mostPushedThisWeek(events, items, today - 6, today),
  };
}
