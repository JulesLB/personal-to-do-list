import { describe, it, expect } from "vitest";
import { modelCostUsd, whisperCostUsd, isPricedModel } from "../src/lib/pricing";

const HAIKU = "claude-haiku-4-5-20251001";

describe("modelCostUsd", () => {
  it("prices Haiku input + output at $1/$5 per MTok", () => {
    // 1,000,000 input + 1,000,000 output = $1 + $5 = $6
    expect(modelCostUsd(HAIKU, { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeCloseTo(6, 10);
  });

  it("prices cache reads at 0.1x input and cache writes at 1.25x input", () => {
    expect(modelCostUsd(HAIKU, { cacheReadTokens: 1_000_000 })).toBeCloseTo(0.1, 10);
    expect(modelCostUsd(HAIKU, { cacheCreateTokens: 1_000_000 })).toBeCloseTo(1.25, 10);
  });

  it("matches a realistic single bot call (~1700 in, ~150 out)", () => {
    // 1700 * $1/M + 150 * $5/M = 0.0017 + 0.00075 = 0.00245
    expect(modelCostUsd(HAIKU, { inputTokens: 1700, outputTokens: 150 })).toBeCloseTo(0.00245, 10);
  });

  it("returns 0 for an unknown model rather than guessing", () => {
    expect(modelCostUsd("some-future-model", { inputTokens: 1_000_000 })).toBe(0);
    expect(isPricedModel("some-future-model")).toBe(false);
    expect(isPricedModel(HAIKU)).toBe(true);
  });
});

describe("whisperCostUsd", () => {
  it("prices at $0.006 per minute", () => {
    expect(whisperCostUsd(60)).toBeCloseTo(0.006, 10);
    expect(whisperCostUsd(30)).toBeCloseTo(0.003, 10);
  });

  it("never goes negative on a bad duration", () => {
    expect(whisperCostUsd(-5)).toBe(0);
  });
});
