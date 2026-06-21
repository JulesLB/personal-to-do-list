import { prisma } from "./db";
import { modelCostUsd, type Usage } from "./pricing";

// The three things in the app that cost money.
export type UsageSource = "classify" | "coach" | "transcribe";
export type Provider = "anthropic" | "openai";

type Meta = {
  source: UsageSource;
  provider: Provider;
  model: string;
  // Stamped on the row when known; null for the `try` CLI and tests, which also
  // suppresses recording entirely (see `track`) so they stay side-effect free.
  userId?: number | null;
};

type RecordInput = Meta & {
  usage?: Usage;
  costUsd?: number; // when the caller computes it (Whisper, priced per second)
  latencyMs?: number;
  ok?: boolean;
  errorKind?: string | null;
};

// Shape the Anthropic SDK's usage block into our Usage. Loose structural type so
// this doesn't depend on the SDK's exported type names.
type AnthropicUsage = {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function usageFromAnthropic(u: AnthropicUsage | undefined | null): Usage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.cache_read_input_tokens ?? 0,
    cacheCreateTokens: u?.cache_creation_input_tokens ?? 0,
  };
}

function errKind(e: unknown): string {
  if (e && typeof e === "object" && "name" in e && typeof e.name === "string") return e.name;
  return "Error";
}

// Best-effort write. Observability must never break the bot, board, or cron, so a
// logging failure is swallowed (and a missing ApiUsage table, e.g. an un-migrated
// local SQLite db, just no-ops here).
export async function recordUsage(input: RecordInput): Promise<void> {
  try {
    const u = input.usage ?? {};
    const costUsd = input.costUsd ?? modelCostUsd(input.model, u);
    await prisma.apiUsage.create({
      data: {
        source: input.source,
        provider: input.provider,
        model: input.model,
        userId: input.userId ?? null,
        inputTokens: u.inputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        cacheReadTokens: u.cacheReadTokens ?? 0,
        cacheCreateTokens: u.cacheCreateTokens ?? 0,
        audioSeconds: u.audioSeconds ?? 0,
        costUsd,
        latencyMs: input.latencyMs ?? null,
        ok: input.ok ?? true,
        errorKind: input.errorKind ?? null,
      },
    });
  } catch {
    // intentionally silent
  }
}

// Time a paid call, log one row (success or failure), and return its result.
// Recording is skipped when userId is null, which keeps the `try` CLI and tests
// from writing telemetry. `extract` pulls usage/cost out of the success result.
export async function track<T>(
  meta: Meta,
  run: () => Promise<T>,
  extract: (r: T) => { usage?: Usage; costUsd?: number }
): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await run();
    if (meta.userId != null) {
      const { usage, costUsd } = extract(r);
      await recordUsage({ ...meta, usage, costUsd, latencyMs: Date.now() - t0, ok: true });
    }
    return r;
  } catch (e) {
    if (meta.userId != null) {
      await recordUsage({ ...meta, latencyMs: Date.now() - t0, ok: false, errorKind: errKind(e) });
    }
    throw e;
  }
}
