import { describe, it, expect } from "vitest";
import { clampTitle, normalizeCategory, MAX_TITLE } from "../src/lib/validate";

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

describe("normalizeCategory", () => {
  it("keeps each of the six known categories", () => {
    for (const c of ["personal", "finance", "fitness", "work", "business", "learning"]) {
      expect(normalizeCategory(c)).toBe(c);
    }
  });

  it("drops an unknown category to null", () => {
    expect(normalizeCategory("groceries")).toBeNull();
    expect(normalizeCategory("WORK")).toBeNull(); // case-sensitive: keys are lowercase
    expect(normalizeCategory("'; drop table")).toBeNull();
  });

  it("treats blank / null / undefined as null", () => {
    expect(normalizeCategory("")).toBeNull();
    expect(normalizeCategory("   ")).toBeNull();
    expect(normalizeCategory(null)).toBeNull();
    expect(normalizeCategory(undefined)).toBeNull();
  });
});
