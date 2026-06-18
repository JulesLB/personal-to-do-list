import { describe, it, expect } from "vitest";
import {
  rankScore,
  heatOf,
  daysOverdue,
  isCritical,
  promisedToday,
  rankActionable,
} from "../src/lib/rank";
import { make, NOW, daysAgo, daysAhead } from "./factory";

describe("rankScore", () => {
  it("parking is always -1", () => {
    expect(rankScore(make({ type: "parking" }), NOW)).toBe(-1);
  });

  it("important outranks unimportant", () => {
    expect(rankScore(make({ important: true }), NOW)).toBeGreaterThan(
      rankScore(make({ important: false }), NOW)
    );
  });

  it("urgent adds weight", () => {
    expect(rankScore(make({ urgent: true }), NOW)).toBeGreaterThan(
      rankScore(make({ urgent: false }), NOW)
    );
  });

  it("an overdue deadline outscores a far-future one", () => {
    expect(rankScore(make({ deadline: daysAhead(-2) }), NOW)).toBeGreaterThan(
      rankScore(make({ deadline: daysAhead(30) }), NOW)
    );
  });

  it("a commitment 2+ cycles overdue hits the top band", () => {
    const c = make({ type: "commitment", cadence: "monthly", lastDoneAt: daysAgo(70) });
    expect(rankScore(c, NOW)).toBe(40 + 50);
  });

  it("a freshly honored commitment sits in the low band", () => {
    const c = make({ type: "commitment", cadence: "monthly", lastDoneAt: daysAgo(1) });
    expect(rankScore(c, NOW)).toBe(40 + 5);
  });
});

describe("heatOf", () => {
  it("a task due today or past is burning", () => {
    expect(heatOf(make({ deadline: daysAhead(0) }), NOW)).toBe("burning");
    expect(heatOf(make({ deadline: daysAhead(-3) }), NOW)).toBe("burning");
  });

  it("a task far out is later", () => {
    expect(heatOf(make({ deadline: daysAhead(30) }), NOW)).toBe("later");
  });

  it("a commitment one full cadence overdue is burning", () => {
    const c = make({ type: "commitment", cadence: "weekly", lastDoneAt: daysAgo(9) });
    expect(heatOf(c, NOW)).toBe("burning");
  });

  it("a commitment well inside its cadence is later", () => {
    const c = make({ type: "commitment", cadence: "weekly", lastDoneAt: daysAgo(1) });
    expect(heatOf(c, NOW)).toBe("later");
  });
});

describe("daysOverdue", () => {
  it("counts calendar days past a task deadline", () => {
    expect(daysOverdue(make({ deadline: daysAhead(-3) }), NOW)).toBe(3);
  });

  it("is -Infinity for a task with no deadline", () => {
    expect(daysOverdue(make({ deadline: null }), NOW)).toBe(-Infinity);
  });
});

describe("isCritical", () => {
  it("fires for a task 3+ days overdue, not at 2", () => {
    expect(isCritical(make({ type: "task", deadline: daysAhead(-3) }), NOW)).toBe(true);
    expect(isCritical(make({ type: "task", deadline: daysAhead(-2) }), NOW)).toBe(false);
  });

  it("fires for a commitment 2 cycles overdue", () => {
    const c = make({ type: "commitment", cadence: "monthly", lastDoneAt: daysAgo(70) });
    expect(isCritical(c, NOW)).toBe(true);
  });
});

describe("promisedToday", () => {
  it("flags a promise made today (HKT)", () => {
    expect(promisedToday(make({ promisedAt: NOW }), NOW)).toBe(true);
  });

  it("ignores a promise from yesterday", () => {
    expect(promisedToday(make({ promisedAt: daysAgo(1) }), NOW)).toBe(false);
  });
});

describe("rankActionable", () => {
  it("drops parking and sorts by score descending", () => {
    const items = [
      make({ id: 1, important: false }),
      make({ id: 2, type: "parking" }),
      make({ id: 3, important: true, urgent: true, deadline: daysAhead(-1) }),
    ];
    expect(rankActionable(items, NOW).map((r) => r.item.id)).toEqual([3, 1]);
  });
});
