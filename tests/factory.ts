import type { Item } from "@prisma/client";

const DAY = 86400000;

// Fixed clock at noon HKT so day-boundary math is deterministic.
export const NOW = new Date("2026-06-18T12:00:00+08:00");
export const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
export const daysAhead = (n: number) => new Date(NOW.getTime() + n * DAY);

export function make(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    userId: 1,
    title: "Test item",
    type: "task",
    important: true,
    deadline: null,
    referee: null,
    category: "personal",
    cadence: null,
    status: "open",
    snoozeUntil: null,
    lastNudgedAt: null,
    promisedAt: null,
    doneAt: null,
    lastDoneAt: null,
    cycleStreak: 0,
    nudgeCount: 0,
    ignoreCount: 0,
    deferCount: 0,
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...overrides,
  } as Item;
}
