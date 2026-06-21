import { describe, it, expect } from "vitest";
import {
  isOnboarding,
  extractName,
  welcomeMessage,
  returningMessage,
  helpMessage,
  orientationMessage,
  ONBOARDING_NEW,
  ONBOARDING_DONE,
} from "../src/lib/onboarding";

describe("isOnboarding", () => {
  it("is true only for a fresh chat stamped new", () => {
    expect(isOnboarding({ onboardingStep: ONBOARDING_NEW })).toBe(true);
  });

  it("is false for a done user and for legacy null", () => {
    expect(isOnboarding({ onboardingStep: ONBOARDING_DONE })).toBe(false);
    expect(isOnboarding({ onboardingStep: null })).toBe(false);
    expect(isOnboarding({})).toBe(false);
  });
});

describe("extractName", () => {
  it("prefers from.first_name, then chat.first_name", () => {
    expect(extractName({ first_name: "Jules" }, { first_name: "Other" })).toBe("Jules");
    expect(extractName(null, { first_name: "Mei" })).toBe("Mei");
  });

  it("trims and caps, and returns undefined when absent or blank", () => {
    expect(extractName({ first_name: "  Jules  " })).toBe("Jules");
    expect(extractName({ first_name: "x".repeat(60) })).toHaveLength(40);
    expect(extractName({ first_name: "   " })).toBeUndefined();
    expect(extractName(null, null)).toBeUndefined();
    expect(extractName()).toBeUndefined();
  });
});

describe("copy", () => {
  it("welcome greets by name when known and falls back when not", () => {
    expect(welcomeMessage("Jules")).toContain("Hey Jules.");
    expect(welcomeMessage(null)).toContain("Hey.");
    // Value-first: the one ask is to capture, not to set anything up.
    expect(welcomeMessage("Jules").toLowerCase()).toContain("avoiding");
  });

  it("the welcome and orientation never dump the command wall", () => {
    expect(welcomeMessage("Jules")).not.toContain("snooze <id>");
    expect(orientationMessage()).not.toContain("snooze <id>");
  });

  it("help carries the full command list, returning points back to it", () => {
    expect(helpMessage()).toContain("snooze <id> <days>");
    expect(helpMessage()).toContain("/board");
    expect(returningMessage()).toContain("/help");
  });

  it("orientation points to the board and closes with a prompt to keep going", () => {
    expect(orientationMessage()).toContain("/board");
    expect(orientationMessage()).toContain("/help");
  });

  it("no em dashes anywhere in the bot copy", () => {
    for (const s of [
      welcomeMessage("Jules"),
      welcomeMessage(null),
      returningMessage(),
      orientationMessage(),
      helpMessage(),
    ]) {
      expect(s).not.toContain("—");
    }
  });
});
