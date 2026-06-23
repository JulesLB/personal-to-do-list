import { describe, it, expect } from "vitest";
import { isTimedNudgeDue, buildTimedNudge, TIMED_GRACE_MS } from "../src/lib/timed";
import { make, NOW } from "./factory";

const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

describe("isTimedNudgeDue", () => {
  it("fires once the dueAt instant has arrived", () => {
    const item = make({ dueAt: at(0), deadline: NOW });
    expect(isTimedNudgeDue(item, NOW)).toBe(true);
  });

  it("stays quiet before dueAt", () => {
    const item = make({ dueAt: at(60_000), deadline: NOW });
    expect(isTimedNudgeDue(item, NOW)).toBe(false);
  });

  it("fires anywhere inside the grace window but not past it", () => {
    const item = make({ dueAt: at(-TIMED_GRACE_MS + 1000), deadline: NOW });
    expect(isTimedNudgeDue(item, NOW)).toBe(true);
    const stale = make({ dueAt: at(-TIMED_GRACE_MS - 1000), deadline: NOW });
    expect(isTimedNudgeDue(stale, NOW)).toBe(false);
  });

  it("never fires twice (dueNudgedAt set)", () => {
    const item = make({ dueAt: at(0), dueNudgedAt: at(0), deadline: NOW });
    expect(isTimedNudgeDue(item, NOW)).toBe(false);
  });

  it("skips an item under an active snooze", () => {
    const item = make({ dueAt: at(0), snoozeUntil: at(HOUR), deadline: NOW });
    expect(isTimedNudgeDue(item, NOW)).toBe(false);
  });

  it("skips closed items and items with no dueAt", () => {
    expect(isTimedNudgeDue(make({ dueAt: at(0), status: "done" }), NOW)).toBe(false);
    expect(isTimedNudgeDue(make({ dueAt: null, deadline: NOW }), NOW)).toBe(false);
  });
});

describe("buildTimedNudge", () => {
  it("renders a single-item ping with one tdone tick", () => {
    const item = make({ id: 42, title: "Call the dentist", dueAt: NOW, deadline: NOW });
    const n = buildTimedNudge(item, NOW);
    expect(n.text).toContain("Call the dentist");
    const data = n.keyboard.inline_keyboard.flat().map((b) =>
      "callback_data" in b ? b.callback_data : undefined
    );
    expect(data).toEqual(["tdone:42"]);
  });
});
