import { describe, it, expect } from "vitest";
import {
  compareActionable,
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

const order = (items: ReturnType<typeof make>[]) =>
  rankActionable(items, NOW).map((r) => r.item.id);

describe("ranking order (date first, importance second)", () => {
  it("a nearer deadline always wins, even over an important far-future one", () => {
    const items = [
      make({ id: 1, important: true, deadline: daysAhead(7) }),
      make({ id: 2, important: false, deadline: daysAhead(1) }),
    ];
    expect(order(items)).toEqual([2, 1]);
  });

  it("the most overdue comes first", () => {
    const items = [
      make({ id: 1, deadline: daysAhead(0) }),
      make({ id: 2, deadline: daysAhead(-3) }),
      make({ id: 3, deadline: daysAhead(-1) }),
    ];
    expect(order(items)).toEqual([2, 3, 1]);
  });

  it("importance only breaks a tie between items due the same day", () => {
    const items = [
      make({ id: 1, important: false, deadline: daysAhead(2) }),
      make({ id: 2, important: true, deadline: daysAhead(2) }),
    ];
    expect(order(items)).toEqual([2, 1]);
  });

  it("a commitment ranks by its computed due date alongside tasks", () => {
    const items = [
      make({ id: 1, deadline: daysAhead(10) }),
      // weekly honored 9d ago -> due 2d ago (overdue), so it leads the 10-day task
      make({ id: 2, type: "commitment", cadence: "weekly", lastDoneAt: daysAgo(9) }),
    ];
    expect(order(items)).toEqual([2, 1]);
  });
});

describe("compareActionable", () => {
  it("orders the earlier date first regardless of importance", () => {
    const near = make({ id: 1, important: false, deadline: daysAhead(1) });
    const far = make({ id: 2, important: true, deadline: daysAhead(5) });
    expect(compareActionable(near, far)).toBeLessThan(0);
  });

  it("falls back to importance only on the same day", () => {
    const plain = make({ id: 1, important: false, deadline: daysAhead(3) });
    const important = make({ id: 2, important: true, deadline: daysAhead(3) });
    expect(compareActionable(important, plain)).toBeLessThan(0);
    expect(compareActionable(plain, important)).toBeGreaterThan(0);
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
  it("drops parking from the actionable list", () => {
    const items = [
      make({ id: 1, important: false, deadline: daysAhead(20) }),
      make({ id: 2, type: "parking" }),
      make({ id: 3, important: true, deadline: daysAhead(-1) }),
    ];
    expect(order(items)).toEqual([3, 1]);
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
  it("reports the push tally: hidden at zero, then just the count", () => {
    expect(deferState(make({ deferCount: 0 }))).toBeNull();
    expect(deferState(make({ deferCount: 1 }))).toEqual({ count: 1 });
    expect(deferState(make({ deferCount: 2 }))).toEqual({ count: 2 });
    expect(deferState(make({ deferCount: 9 }))).toEqual({ count: 9 });
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

  // The recurring-date fix: the day-of-month is anchored on the stored deadline,
  // not on when the item was created or last tapped. These are the two real items
  // (created 22 Jun) that were both showing "due in 29 days" before the fix.
  it("a not-yet-done commitment is due on its deadline, not created + a period", () => {
    const rent = make({
      type: "commitment",
      cadence: "monthly",
      deadline: at9("2026-07-01"),
      lastDoneAt: null,
      createdAt: at9("2026-06-22"),
    });
    expect(commitmentDue(rent).toISOString()).toBe(at9("2026-07-01").toISOString());
  });

  it("a not-yet-done monthly due tomorrow reads its deadline, not the creation month", () => {
    const birdie = make({
      type: "commitment",
      cadence: "monthly",
      deadline: at9("2026-06-24"),
      lastDoneAt: null,
      createdAt: at9("2026-06-22"),
    });
    expect(commitmentDue(birdie).toISOString()).toBe(at9("2026-06-24").toISOString());
  });

  it("honoring a cycle on time rolls to the same day next month", () => {
    const birdie = make({
      type: "commitment",
      cadence: "monthly",
      deadline: at9("2026-06-24"),
      lastDoneAt: at9("2026-06-24"),
    });
    expect(commitmentDue(birdie).toISOString()).toBe(at9("2026-07-24").toISOString());
  });

  it("honoring a cycle late keeps the next due on the deadline's day, not the tap day", () => {
    // Due the 24th, paid two days late on the 26th: next is 24 Jul, not 26 Jul.
    const birdie = make({
      type: "commitment",
      cadence: "monthly",
      deadline: at9("2026-06-24"),
      lastDoneAt: at9("2026-06-26"),
    });
    expect(commitmentDue(birdie).toISOString()).toBe(at9("2026-07-24").toISOString());
  });

  it("a weekly commitment honored late keeps its weekday (deadline + 7, not tap + 7)", () => {
    // Due 26 Jun, done 2 days late on the 28th: next is 3 Jul (26 + 7), not 5 Jul.
    const c = make({
      type: "commitment",
      cadence: "weekly",
      deadline: at9("2026-06-26"),
      lastDoneAt: at9("2026-06-28"),
    });
    expect(commitmentDue(c).toISOString()).toBe(at9("2026-07-03").toISOString());
  });

  it("a not-yet-done commitment past its deadline stays on that date (honestly overdue)", () => {
    const c = make({
      type: "commitment",
      cadence: "monthly",
      deadline: at9("2026-06-01"),
      lastDoneAt: null,
    });
    expect(commitmentDue(c).toISOString()).toBe(at9("2026-06-01").toISOString());
  });

  it("labels a not-yet-due commitment with its deadline and no 'overdue'", () => {
    const rent = make({
      type: "commitment",
      cadence: "monthly",
      deadline: at9("2026-07-01"),
      lastDoneAt: null,
    });
    const label = commitmentDueLabel(rent, NOW);
    expect(label).toContain("due 1 Jul");
    expect(label).not.toContain("overdue");
  });
});
