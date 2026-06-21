import { describe, it, expect } from "vitest";
import { triage, fireTier, type TriageEvent } from "../src/lib/triage";
import { make, NOW, daysAgo } from "./factory";

const told = (itemId: number, d: number): TriageEvent => ({
  kind: "told_referee",
  itemId,
  createdAt: daysAgo(d),
});

describe("triage", () => {
  it("buckets each slipping signal and orders hottest first", () => {
    const items = [
      make({ id: 1, title: "Death", type: "parking", deadline: null, createdAt: daysAgo(10) }),
      make({ id: 2, title: "Dodge", deferCount: 3 }),
      make({ id: 5, title: "Escalated", important: true, referee: "wife", deadline: daysAgo(6) }),
    ];
    const t = triage(items, [told(5, 0)], NOW);
    expect(t.entries.map((e) => e.bucket)).toEqual(["escalated", "dodging", "death_zone"]);
    expect(t.count).toBe(3);
    expect(t.heat).toBe(4 + 1.5 + 1);
  });

  it("an item lands in only its most severe bucket", () => {
    // important + referee + critical + dodged + promised: escalated must win once.
    const it = make({
      id: 1,
      important: true,
      referee: "wife",
      deadline: daysAgo(10),
      deferCount: 5,
      promisedAt: daysAgo(3),
    });
    const t = triage([it], [told(1, 0)], NOW);
    expect(t.count).toBe(1);
    expect(t.entries[0].bucket).toBe("escalated");
  });

  it("a told_referee before the cycle anchor does not count as escalated", () => {
    // The send predates lastDoneAt (the cycle was honored after), so the ladder reset.
    // The item is also dodged, so it still surfaces, just not as escalated.
    const it = make({
      id: 1,
      important: true,
      referee: "wife",
      deadline: daysAgo(10),
      lastDoneAt: daysAgo(2),
      deferCount: 2,
    });
    const t = triage([it], [told(1, 5)], NOW);
    expect(t.entries[0].bucket).toBe("dodging");
  });

  it("parked under the stale threshold is not yet death zone", () => {
    const fresh = make({ id: 1, type: "parking", deadline: null, createdAt: daysAgo(3) });
    expect(triage([fresh], [], NOW).count).toBe(0);
    const rotting = make({ id: 2, type: "parking", deadline: null, createdAt: daysAgo(8) });
    expect(triage([rotting], [], NOW).entries[0].bucket).toBe("death_zone");
  });

  it("excludes done and retired items", () => {
    const items = [
      make({ id: 1, deferCount: 4, status: "done" }),
      make({ id: 2, deferCount: 4, status: "retired" }),
    ];
    expect(triage(items, [], NOW).count).toBe(0);
  });

  it("fireTier maps heat to intensity, out at zero", () => {
    expect(fireTier(0)).toBe("out");
    expect(fireTier(2)).toBe("warm");
    expect(fireTier(6)).toBe("hot");
    expect(fireTier(12)).toBe("inferno");
  });
});
