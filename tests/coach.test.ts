import { describe, it, expect } from "vitest";
import { coachReady, warmingMessage } from "../src/lib/coach";
import { make, NOW, daysAgo } from "./factory";

const done = (n: number) => Array.from({ length: n }, () => ({ kind: "done" }));

describe("coachReady", () => {
  it("is false with no items", () => {
    expect(coachReady([], [], NOW)).toBe(false);
  });

  it("is false for a fresh, quiet account (few outcomes, days < 7)", () => {
    const items = [make({ createdAt: daysAgo(1), deadline: null, type: "parking" })];
    expect(coachReady(items, done(0), NOW)).toBe(false);
  });

  it("is true once cleared outcomes reach the threshold", () => {
    const items = [make({ createdAt: daysAgo(1) })];
    expect(coachReady(items, done(5), NOW)).toBe(true);
  });

  it("counts currently-overdue open items as outcomes", () => {
    const overdue = Array.from({ length: 5 }, (_, i) =>
      make({ id: i + 1, deadline: daysAgo(2), createdAt: daysAgo(2) })
    );
    expect(coachReady(overdue, done(0), NOW)).toBe(true);
  });

  it("mixes cleared and missed toward the threshold", () => {
    const items = Array.from({ length: 2 }, (_, i) =>
      make({ id: i + 1, deadline: daysAgo(2), createdAt: daysAgo(2) })
    );
    expect(coachReady(items, done(3), NOW)).toBe(true);
  });

  it("falls back to time: a week of history flips it on even when quiet", () => {
    const old = [make({ createdAt: daysAgo(7), deadline: null, type: "parking" })];
    expect(coachReady(old, done(0), NOW)).toBe(true);
    const almost = [make({ createdAt: daysAgo(6), deadline: null, type: "parking" })];
    expect(coachReady(almost, done(0), NOW)).toBe(false);
  });
});

describe("warmingMessage", () => {
  it("names the streak when there is one, falls back otherwise", () => {
    expect(warmingMessage(0, 3).title).toContain("3");
    expect(warmingMessage(0, 0).title).toBe("🌱 Getting started");
  });

  it("acknowledges early clears only when there are some", () => {
    expect(warmingMessage(2, 0).body).toContain("cleared so far");
    expect(warmingMessage(0, 0).body).not.toContain("cleared so far");
  });

  it("stays honest about what's coming, no faked insight", () => {
    expect(warmingMessage(0, 0).body.toLowerCase()).toContain("week");
  });

  it("no em dashes in the warming copy", () => {
    expect(warmingMessage(2, 3).body).not.toContain("—");
    expect(warmingMessage(0, 0).body).not.toContain("—");
  });
});
