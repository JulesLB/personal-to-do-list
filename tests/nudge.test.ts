import { describe, it, expect } from "vitest";
import { buildDailyNudge } from "../src/lib/nudge";
import { make, NOW, daysAhead } from "./factory";

describe("buildDailyNudge", () => {
  it("returns null with no items", () => {
    expect(buildDailyNudge([], NOW, "morning")).toBeNull();
  });

  it("stays silent when nothing is overdue or due today", () => {
    const future = make({ id: 1, deadline: daysAhead(30) });
    const parking = make({ id: 2, deadline: null });
    expect(buildDailyNudge([future, parking], NOW, "morning")).toBeNull();
    expect(buildDailyNudge([future, parking], NOW, "evening")).toBeNull();
  });

  it("morning lists the sections with no buttons", () => {
    const n = buildDailyNudge(
      [
        make({ id: 5, title: "Book dentist", deadline: daysAhead(-1) }),
        make({ id: 6, title: "Pay rent", deadline: daysAhead(0) }),
      ],
      NOW,
      "morning"
    );
    expect(n?.text).toContain("Overdue (1)");
    expect(n?.text).toContain("Book dentist");
    expect(n?.text).toContain("Due today (1)");
    expect(n?.keyboard).toBeUndefined();
    expect(n?.topId).toBe(5);
  });

  it("evening numbers the items and gives each a tick button", () => {
    const n = buildDailyNudge(
      [
        make({ id: 5, title: "Book dentist", deadline: daysAhead(-1) }),
        make({ id: 6, title: "Pay rent", deadline: daysAhead(0) }),
      ],
      NOW,
      "evening"
    );
    expect(n?.text).toContain("1. Book dentist");
    expect(n?.text).toContain("2. Pay rent");
    const data = n!.keyboard!.inline_keyboard.flat().map((b) =>
      "callback_data" in b ? b.callback_data : undefined
    );
    expect(data).toEqual(["done:5", "done:6"]);
  });

  it("excludes future and parking items from the digest", () => {
    const n = buildDailyNudge(
      [
        make({ id: 5, title: "Book dentist", deadline: daysAhead(-1) }),
        make({ id: 7, title: "Plan holiday", deadline: daysAhead(30) }),
        make({ id: 8, title: "Someday idea", deadline: null }),
      ],
      NOW,
      "evening"
    );
    expect(n?.text).not.toContain("Plan holiday");
    expect(n?.text).not.toContain("Someday idea");
  });

  it("caps each section at three and rolls the rest into +N more", () => {
    const overdue = [1, 2, 3, 4, 5].map((id) =>
      make({ id, title: `Overdue ${id}`, deadline: daysAhead(-id) })
    );
    const n = buildDailyNudge(overdue, NOW, "evening");
    expect(n?.text).toContain("Overdue (5)");
    expect(n?.text).toContain("+2 more");
    // Only three ticks, not five.
    expect(n!.keyboard!.inline_keyboard.flat()).toHaveLength(3);
  });

  it("packs the evening tick grid three per row", () => {
    const items = [1, 2, 3, 4, 5, 6].map((id) =>
      make({ id, title: `Due ${id}`, deadline: daysAhead(0) })
    );
    const n = buildDailyNudge(items, NOW, "evening");
    // Three due today shown (cap), so a single row of three ticks.
    const rows = n!.keyboard!.inline_keyboard;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(3);
  });
});
