import { describe, it, expect } from "vitest";
import { buildDailyNudge } from "../src/lib/nudge";
import { make, NOW, daysAhead } from "./factory";

describe("buildDailyNudge", () => {
  it("returns null with no items", () => {
    expect(buildDailyNudge([], NOW, "morning")).toBeNull();
  });

  it("morning surfaces the top item", () => {
    const n = buildDailyNudge(
      [make({ id: 5, title: "Book dentist", deadline: daysAhead(-1) })],
      NOW,
      "morning"
    );
    expect(n?.topId).toBe(5);
    expect(n?.text).toContain("Book dentist");
  });

  it("evening stays silent when nothing is pressing", () => {
    expect(buildDailyNudge([make({ id: 1, deadline: daysAhead(30) })], NOW, "evening")).toBeNull();
  });

  it("evening leads with the broken promise made this morning", () => {
    const promised = make({
      id: 2,
      title: "Call the bank",
      deadline: daysAhead(10),
      promisedAt: NOW,
      referee: "wife",
    });
    const n = buildDailyNudge([promised], NOW, "evening");
    expect(n?.topId).toBe(2);
    expect(n?.text.toLowerCase()).toContain("promised");
  });

  it("escalation puts the referee button first", () => {
    const crit = make({ id: 3, title: "File the taxes", deadline: daysAhead(-5), referee: "wife" });
    const n = buildDailyNudge([crit], NOW, "morning");
    const first = n!.keyboard.inline_keyboard[0][0];
    expect("url" in first && !!first.url).toBe(true);
    expect(n!.text.toLowerCase()).toContain("overdue");
  });
});
