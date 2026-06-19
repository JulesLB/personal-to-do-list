import { describe, it, expect } from "vitest";
import { snoozeUntil } from "../src/lib/snooze";

// Fixed clock: Thursday 2026-06-18, noon HKT.
const NOON = new Date("2026-06-18T12:00:00+08:00");
const EVENING = new Date("2026-06-18T22:00:00+08:00");

describe("snoozeUntil", () => {
  it("tonight before 20:00 lands at 20:00 HKT today", () => {
    expect(snoozeUntil("tonight", NOON).toISOString()).toBe(
      new Date("2026-06-18T20:00:00+08:00").toISOString()
    );
  });

  it("tonight after 20:00 rolls to tomorrow 08:00 HKT", () => {
    expect(snoozeUntil("tonight", EVENING).toISOString()).toBe(
      new Date("2026-06-19T08:00:00+08:00").toISOString()
    );
  });

  it("tomorrow is the next HKT day at 08:00", () => {
    expect(snoozeUntil("tomorrow", NOON).toISOString()).toBe(
      new Date("2026-06-19T08:00:00+08:00").toISOString()
    );
  });

  it("weekend from a Thursday is the coming Saturday 08:00 HKT", () => {
    expect(snoozeUntil("weekend", NOON).toISOString()).toBe(
      new Date("2026-06-20T08:00:00+08:00").toISOString()
    );
  });

  it("next week from a Thursday is the coming Monday 08:00 HKT", () => {
    expect(snoozeUntil("nextweek", NOON).toISOString()).toBe(
      new Date("2026-06-22T08:00:00+08:00").toISOString()
    );
  });

  it("weekend on a Saturday pushes a full week, never today", () => {
    const sat = new Date("2026-06-20T12:00:00+08:00");
    expect(snoozeUntil("weekend", sat).toISOString()).toBe(
      new Date("2026-06-27T08:00:00+08:00").toISOString()
    );
  });
});
