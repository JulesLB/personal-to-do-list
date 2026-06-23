import { describe, expect, it } from "vitest";
import { targetIdsFromRaw } from "../src/lib/classify";

// Locks the "reply says N, actions do N" contract: the route tool's id fields must
// resolve to the exact set of items the webhook will act on. The original bug was a
// multi-item "both are done" collapsing to a single completion.
describe("targetIdsFromRaw", () => {
  it("folds a lone itemId into a single-element list", () => {
    expect(targetIdsFromRaw({ itemId: 66 })).toEqual([66]);
  });

  it("takes every id when itemIds carries several (the both-are-done case)", () => {
    expect(targetIdsFromRaw({ itemId: null, itemIds: [66, 73] })).toEqual([66, 73]);
  });

  it("prefers itemIds over a single itemId when both are present", () => {
    expect(targetIdsFromRaw({ itemId: 66, itemIds: [66, 73] })).toEqual([66, 73]);
  });

  it("dedupes repeated ids", () => {
    expect(targetIdsFromRaw({ itemIds: [66, 66, 73] })).toEqual([66, 73]);
  });

  it("returns an empty list when there is no target", () => {
    expect(targetIdsFromRaw({ itemId: null })).toEqual([]);
    expect(targetIdsFromRaw({})).toEqual([]);
  });

  it("ignores non-number entries", () => {
    expect(targetIdsFromRaw({ itemIds: [66, "73", null, 80] })).toEqual([66, 80]);
  });
});
