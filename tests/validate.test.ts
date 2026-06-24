import { describe, it, expect } from "vitest";
import { clampTitle, MAX_TITLE } from "../src/lib/validate";

describe("clampTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(clampTitle("  call the dentist  ")).toBe("call the dentist");
  });

  it("returns empty for blank or whitespace-only input", () => {
    expect(clampTitle("")).toBe("");
    expect(clampTitle("   ")).toBe("");
    expect(clampTitle(null)).toBe("");
    expect(clampTitle(undefined)).toBe("");
  });

  it("caps the title at MAX_TITLE characters", () => {
    const long = "x".repeat(MAX_TITLE + 500);
    expect(clampTitle(long).length).toBe(MAX_TITLE);
  });

  it("leaves a normal title untouched", () => {
    expect(clampTitle("file the Q3 taxes")).toBe("file the Q3 taxes");
  });
});
