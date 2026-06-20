import { describe, it, expect } from "vitest";
import { escalationStep } from "../src/lib/escalate";
import { make, NOW, daysAgo } from "./factory";

// A task is "critical" (escalate tier) at 3+ days overdue and important.
const critical = () => make({ id: 1, title: "File taxes", deadline: daysAgo(5), referee: "wife" });

describe("escalationStep", () => {
  it("stays none until the item is critical", () => {
    const notYet = make({ id: 1, deadline: daysAgo(1), referee: "wife", important: true });
    expect(
      escalationStep({ item: notYet, now: NOW, optedIn: true, alreadyWarned: false, alreadySent: false })
    ).toBe("none");
  });

  it("never escalates an unimportant item", () => {
    const item = make({ ...critical(), important: false });
    expect(
      escalationStep({ item, now: NOW, optedIn: true, alreadyWarned: false, alreadySent: false })
    ).toBe("none");
  });

  it("warns first when critical with an opted-in referee", () => {
    expect(
      escalationStep({ item: critical(), now: NOW, optedIn: true, alreadyWarned: false, alreadySent: false })
    ).toBe("warn");
  });

  it("sends once the warning has already gone out", () => {
    expect(
      escalationStep({ item: critical(), now: NOW, optedIn: true, alreadyWarned: true, alreadySent: false })
    ).toBe("send");
  });

  it("never sends twice in a cycle", () => {
    expect(
      escalationStep({ item: critical(), now: NOW, optedIn: true, alreadyWarned: true, alreadySent: true })
    ).toBe("none");
  });

  it("escalates copy but never auto-sends without an opted-in referee", () => {
    expect(
      escalationStep({ item: critical(), now: NOW, optedIn: false, alreadyWarned: true, alreadySent: false })
    ).toBe("none");
  });
});
