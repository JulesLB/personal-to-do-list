import { describe, it, expect } from "vitest";
import {
  rankScore,
  heatOf,
  daysOverdue,
  isCritical,
  promisedToday,
  rankActionable,
  commitmentDue,
  commitmentDueLabel,
  deriveType,
  deferState,
  dueTone,
  sortByDate,
  parkingAgeLabel,
  isStaleParking,
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

  it("a nearer deadline outscores a far-future one (urgency comes from the date)", () => {
    expect(rankScore(make({ deadline: daysAhead(0) }), NOW)).toBeGreaterThan(
      rankScore(make({ deadline: daysAhead(30) }), NOW)
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
      make({ id: 1, important: false, deadline: daysAhead(20) }),
      make({ id: 2, type: "parking" }),
      make({ id: 3, important: true, deadline: daysAhead(-1) }),
    ];
    expect(rankActionable(items, NOW).map((r) => r.item.id)).toEqual([3, 1]);
  });
});

describe("deriveType (date is the only lever)", () => {
  it("a cadence makes it a commitment, deadline or not", () => {
    expect(deriveType(null, "weekly")).toBe("commitment");
    expect(deriveType(daysAhead(3), "monthly")).toBe("commitment");
  });

  it("a one-off date makes it a task", () => {
    expect(deriveType(daysAhead(3), null)).toBe("task");
  });

  it("neither date nor cadence parks it", () => {
    expect(deriveType(null, null)).toBe("parking");
  });
});

describe("deferState", () => {
  it("grades the push tally: hidden at zero, then low / high / alarm", () => {
    expect(deferState(make({ deferCount: 0 }))).toBeNull();
    expect(deferState(make({ deferCount: 1 }))).toEqual({ count: 1, tier: "low" });
    expect(deferState(make({ deferCount: 2 }))).toEqual({ count: 2, tier: "high" });
    expect(deferState(make({ deferCount: 3 }))).toEqual({ count: 3, tier: "alarm" });
    expect(deferState(make({ deferCount: 9 }))?.tier).toBe("alarm");
  });
});

describe("dueTone (due-label color)", () => {
  it("treats today and tomorrow as burning, 2-3 days as soon, beyond as later", () => {
    expect(dueTone(make({ deadline: daysAhead(0) }), NOW)).toBe("burning");
    expect(dueTone(make({ deadline: daysAhead(1) }), NOW)).toBe("burning");
    expect(dueTone(make({ deadline: daysAhead(3) }), NOW)).toBe("soon");
    expect(dueTone(make({ deadline: daysAhead(6) }), NOW)).toBe("later");
  });
});

describe("sortByDate (calm bands)", () => {
  it("orders by the effective date, soonest first, regardless of importance", () => {
    const rows = rankActionable(
      [
        make({ id: 1, important: true, deadline: daysAhead(6) }),
        make({ id: 2, important: false, deadline: daysAhead(5) }),
      ],
      NOW
    );
    expect(sortByDate(rows).map((r) => r.item.id)).toEqual([2, 1]);
  });
});

describe("parking age", () => {
  it("labels how long it's sat and flags it once stale", () => {
    expect(parkingAgeLabel(daysAgo(20), NOW)).toBe("added 20d ago");
    expect(isStaleParking(make({ type: "parking", createdAt: daysAgo(20) }), NOW)).toBe(true);
    expect(isStaleParking(make({ type: "parking", createdAt: daysAgo(3) }), NOW)).toBe(false);
  });
});

describe("commitmentDue (calendar-accurate)", () => {
  const at9 = (iso: string) => new Date(`${iso}T09:00:00+08:00`);
  const due = (lastDoneAt: Date, cadence: string) =>
    commitmentDue(make({ type: "commitment", cadence, lastDoneAt })).toISOString();

  it("monthly keeps the same day next month", () => {
    expect(due(at9("2026-06-19"), "monthly")).toBe(at9("2026-07-19").toISOString());
  });

  it("monthly clamps to the last day of a short month", () => {
    expect(due(at9("2026-01-31"), "monthly")).toBe(at9("2026-02-28").toISOString());
  });

  it("monthly rolls over the year in December", () => {
    expect(due(at9("2026-12-15"), "monthly")).toBe(at9("2027-01-15").toISOString());
  });

  it("weekly lands on the same weekday seven days on", () => {
    expect(due(at9("2026-06-19"), "weekly")).toBe(at9("2026-06-26").toISOString());
  });

  it("labels an overdue monthly with its date and days late", () => {
    const c = make({ type: "commitment", cadence: "monthly", lastDoneAt: at9("2026-04-09") });
    const label = commitmentDueLabel(c, NOW);
    expect(label).toContain("due 9 May");
    expect(label).toContain("overdue");
  });
});
