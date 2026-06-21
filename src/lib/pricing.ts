// Central price table + pure cost math for every paid call the app makes. Rates
// are USD per token (per second for audio), so a cost is always recomputable from
// the raw counts stored on an ApiUsage row. The row also snapshots the computed
// cost at write time, so a later price change here never rewrites past spend.

export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreateTokens?: number;
  audioSeconds?: number;
};

type ModelRate = {
  input: number; // USD per input token
  output: number; // USD per output token
  cacheRead: number; // USD per cached-read input token
  cacheWrite: number; // USD per cache-write input token
};

const PER_MILLION = 1 / 1_000_000;

// Anthropic Haiku 4.5: $1 / $5 per MTok. Cache read is 0.1x input, cache write
// 1.25x input. The app is Haiku-only today; add a row here when that changes.
const MODEL_RATES: Record<string, ModelRate> = {
  "claude-haiku-4-5-20251001": {
    input: 1 * PER_MILLION,
    output: 5 * PER_MILLION,
    cacheRead: 0.1 * PER_MILLION,
    cacheWrite: 1.25 * PER_MILLION,
  },
};

// OpenAI Whisper: $0.006 / minute = $0.0001 / second.
const WHISPER_PER_SECOND = 0.006 / 60;

// Token-priced model cost. An unknown model returns 0 rather than guessing, so a
// new model silently logs $0 until its rate is added here (visible as zero cost
// on the dashboard, the cue to add it).
export function modelCostUsd(model: string, u: Usage): number {
  const r = MODEL_RATES[model];
  if (!r) return 0;
  return (
    (u.inputTokens ?? 0) * r.input +
    (u.outputTokens ?? 0) * r.output +
    (u.cacheReadTokens ?? 0) * r.cacheRead +
    (u.cacheCreateTokens ?? 0) * r.cacheWrite
  );
}

export function whisperCostUsd(seconds: number): number {
  return Math.max(0, seconds) * WHISPER_PER_SECOND;
}

export function isPricedModel(model: string): boolean {
  return model in MODEL_RATES;
}
