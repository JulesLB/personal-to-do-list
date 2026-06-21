import { describe, it, expect } from "vitest";
import { weeklyReceipts, type ReceiptEvent } from "../src/lib/receipts";
import { make, NOW, daysAgo } from "./factory";

// A done at d days ago for item id, and the promise/snooze equivalents. Keeps the
// fixtures readable: every Event is "kind, item, when".
const ev = (kind: string, itemId: number, d: number): ReceiptEvent => ({
  kind,
  itemId,
  createdAt: daysAgo(d),
});

describe("weeklyReceipts", () => {
  it("counts cleared and pushed inside the 7-day window, splitting this vs last week", () => {
    const items = [make({ id: 1, title: "A" }), make({ id: 2, title: "B" })];
    const events: ReceiptEvent[] = [
      ev("done", 1, 0), // today
      ev("done", 1, 5), // this week
      ev("done", 2, 9), // last week
      ev("snoozed", 2, 2), // this week
      ev("snoozed", 2, 3), // this week
      ev("snoozed", 1, 10), // last week
    ];
    const r = weeklyReceipts(items, events, NOW);
    expect(r.thisWeek.cleared).toBe(2);
    expect(r.thisWeek.pushed).toBe(2);
    expect(r.lastWeek.cleared).toBe(1);
    expect(r.lastWeek.pushed).toBe(1);
  });

  it("excludes events older than 14 days from both windows", () => {
    const items = [make({ id: 1 })];
    const events: ReceiptEvent[] = [ev("done", 1, 20), ev("snoozed", 1, 30)];
    const r = weeklyReceipts(items, events, NOW);
    expect(r.thisWeek.cleared).toBe(0);
    expect(r.lastWeek.cleared).toBe(0);
  });

  it("kept-promise rate counts a promise done the same HKT day, not a later one", () => {
    const items = [make({ id: 1 }), make({ id: 2 }), make({ id: 3 })];
    const events: ReceiptEvent[] = [
      ev("promised", 1, 1),
      ev("done", 1, 1), // kept: same day
      ev("promised", 2, 2),
      ev("done", 2, 0), // broken: done a different day
      ev("promised", 3, 3), // broken: never done
    ];
    const r = weeklyReceipts(items, events, NOW);
    expect(r.thisWeek.promised).toBe(3);
    expect(r.thisWeek.kept).toBe(1);
    expect(r.thisWeek.keptRate).toBeCloseTo(1 / 3);
  });

  it("kept-promise rate is null when nothing was promised", () => {
    const r = weeklyReceipts([make({ id: 1 })], [ev("done", 1, 1)], NOW);
    expect(r.thisWeek.keptRate).toBeNull();
  });

  it("most-pushed picks the item snoozed most this week and resolves its title", () => {
    const items = [make({ id: 1, title: "Taxes" }), make({ id: 2, title: "Gym" })];
    const events: ReceiptEvent[] = [
      ev("snoozed", 1, 1),
      ev("snoozed", 1, 2),
      ev("snoozed", 1, 3),
      ev("snoozed", 2, 1),
      ev("snoozed", 2, 10), // last week, ignored
    ];
    const r = weeklyReceipts(items, events, NOW);
    expect(r.mostPushed).toEqual({ title: "Taxes", count: 3 });
  });

  it("most-pushed is null on a week with no pushes", () => {
    const r = weeklyReceipts([make({ id: 1 })], [ev("done", 1, 1)], NOW);
    expect(r.mostPushed).toBeNull();
  });
});
