import type { Item } from "@prisma/client";
import { anthropic, MODELS } from "./anthropic";
import { daysOverdue, commitmentDue, dueInLabel } from "./rank";
import { triage, type TriageEvent } from "./triage";
import { weeklyReceipts, type ReceiptEvent } from "./receipts";
import { track, usageFromAnthropic } from "./usage";

// The cached read. Three short beats the Review card renders top to bottom, plus
// when it was made so the page can show "updated Xm ago". The shape mirrors how a
// sharp friend would say it: name the habit, say why it bites, give one move.
export type CoachAnalysis = {
  pattern: string; // the behavioral habit, named — leads the card
  soWhat: string; // what to change about how you operate
  doThis: string; // one concrete next move, single sentence, task by title
  generatedAt: string; // ISO
};

// Cold-start gate. A coach that claims to read your habits on day 1 is obviously
// faking, and that's exactly when trust is lost. So the personalized read stays
// off until there's real behavior to read: about 5 outcomes (deadlines cleared or
// currently missed) or a week of history, whichever comes first. Below the gate
// the page shows generic encouragement and skips the model call entirely.
export const COACH_MIN_OUTCOMES = 5;
export const COACH_MIN_DAYS = 7;

export function coachReady(
  items: Item[],
  events: { kind: string }[],
  now: Date
): boolean {
  if (!items.length) return false;
  const cleared = events.filter((e) => e.kind === "done").length;
  const missed = items.filter((i) => i.status === "open" && daysOverdue(i, now) > 0).length;
  const earliest = Math.min(...items.map((i) => i.createdAt.getTime()));
  const daysActive = Math.floor((now.getTime() - earliest) / 86400000);
  return cleared + missed >= COACH_MIN_OUTCOMES || daysActive >= COACH_MIN_DAYS;
}

// What the Review card says before the coach has earned the right to read you.
// Warm and honest, not a fake insight: acknowledge any early wins, say what's
// coming. Lightly adaptive on the week's clears and the streak.
export function warmingMessage(
  clearedThisWeek: number,
  streak: number
): { title: string; body: string } {
  const title = streak > 1 ? `🔥 ${streak}-day start` : "🌱 Getting started";
  const opener = clearedThisWeek > 0 ? `${clearedThisWeek} cleared so far, good. ` : "";
  return {
    title,
    body: `${opener}Keep capturing what you keep putting off and clearing what's due. Once I've watched about a week of your habits, I'll start naming your patterns and the one thing to fix.`,
  };
}

// Pure: turn the live state into the user message the model reasons over. Grounds
// every number so the read references real items and counts, not vibes. Exported
// so the prompt can be inspected/tested without an API call.
export function coachContext(
  items: Item[],
  events: { itemId: number; kind: string; createdAt: Date }[],
  now: Date
): string {
  const open = items.filter((i) => i.status === "open");
  const t = triage(open, events as TriageEvent[], now);
  const r = weeklyReceipts(items, events as ReceiptEvent[], now);

  const slipping = t.entries.length
    ? t.entries
        .map(({ item, bucket }) => {
          const od = daysOverdue(item, now);
          const due =
            item.type === "commitment"
              ? dueInLabel(commitmentDue(item), now)
              : item.deadline
                ? dueInLabel(item.deadline, now)
                : "no date";
          return (
            `#${item.id} "${item.title}" [${bucket}] ${due}` +
            (Number.isFinite(od) && od > 0 ? `, ${od}d overdue` : "") +
            (item.referee ? `, referee:${item.referee}` : ", no referee") +
            (item.deferCount > 0 ? `, pushed ${item.deferCount}x` : "") +
            `, nudged ${item.nudgeCount}x, ignored ${item.ignoreCount}x`
          );
        })
        .join("\n")
    : "(nothing slipping)";

  return `THIS WEEK: cleared ${r.thisWeek.cleared}, pushed ${r.thisWeek.pushed}, streak ${r.streak} days.
LAST WEEK: cleared ${r.lastWeek.cleared}, pushed ${r.lastWeek.pushed}.
${r.mostPushed ? `Most-pushed item this week: "${r.mostPushed.title}" (${r.mostPushed.count}x).` : ""}

SLIPPING ITEMS (hottest first):
${slipping}`;
}

const SYSTEM = `You are Ember's accountability coach for Jules. His problem is follow-through, not capture. You read his slipping items and his week, then give three short beats he can take in at a glance. A friction layer, not a cheerleader. Blunt, specific, useful.

Return exactly three fields, each tight:
- "pattern": 1-2 sentences naming the habit the data shows. Use the real item TITLE, never an id or a "#". Name the behavior: something dodged for weeks, a referee never used, important things left undated to rot in parking. Direct address ("you").
- "soWhat": 1-2 sentences on what to change about how he operates. The behavioral fix, not a task. Grounded in the pattern above.
- "doThis": ONE sentence. One concrete move to make right now, naming the task by title. No second sentence, no "because", no why. If something's been dodged for weeks and is undated or long overdue, it's fair to say kill it or cut it to a 10-minute first step instead of "do it".

Voice (hard rules):
- Short sentences. Vary the length. Contractions. Use "you".
- NO em dashes. Use commas, periods, colons.
- Never reference an item by number or "#"; always by its title in quotes.
- Banned words (these read as machine-written): leverage, robust, streamline, optimize, holistic, crucial, pivotal, seamless, unlock, empower, elevate, foster, landscape, delve, realm.
- Banned structure (fatal): no "it's not X, it's Y", no "not X. Y.", no "less X, more Y", no sentence that negates one framing to assert another. Just say the thing.
- No praise padding, no generic productivity advice, no meta commentary about what you're saying.`;

// Impure: the actual model call. Returns a fresh analysis stamped with now.
// userId is for the cost log (the Refresh button passes it); omit it and nothing
// is recorded.
export async function generateAnalysis(
  items: Item[],
  events: { itemId: number; kind: string; createdAt: Date }[],
  now: Date,
  userId?: number
): Promise<CoachAnalysis> {
  const res = await track(
    { source: "coach", provider: "anthropic", model: MODELS.classify, userId },
    () =>
      anthropic.messages.create({
        model: MODELS.classify,
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: "user", content: coachContext(items, events, now) }],
        tools: [
          {
            name: "coach",
            description: "Return the three-beat accountability read: the pattern, what to change, the one move.",
            input_schema: {
              type: "object",
              properties: {
                pattern: { type: "string", description: "1-2 sentences naming the habit, item by title" },
                soWhat: { type: "string", description: "1-2 sentences on what to change about how he operates" },
                doThis: { type: "string", description: "ONE sentence, one concrete move, task by title, no why" },
              },
              required: ["pattern", "soWhat", "doThis"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "coach" },
      }),
    (r) => ({ usage: usageFromAnthropic(r.usage) })
  );

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No analysis returned");
  const raw = block.input as Record<string, unknown>;

  return {
    pattern: (raw.pattern as string) ?? "",
    soWhat: (raw.soWhat as string) ?? "",
    doThis: (raw.doThis as string) ?? "",
    generatedAt: now.toISOString(),
  };
}
