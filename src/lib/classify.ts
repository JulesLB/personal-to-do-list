import { anthropic, MODELS } from "./anthropic";
import { track, usageFromAnthropic } from "./usage";

export type Category =
  | "personal"
  | "finance"
  | "fitness"
  | "work"
  | "business"
  | "learning";

export type ItemType = "task" | "commitment" | "parking";
// Referee labels are per-user now (PRD-10), so the field is an open string.
export type Referee = string | null;

// The fields a create or update can carry. For a create, all relevant fields
// are present; for an update, only the keys the user actually wants changed.
export type ItemFields = {
  title?: string;
  type?: ItemType;
  category?: Category;
  important?: boolean;
  deadline?: string | null;
  // M8: a precise clock time (24h "HH:MM") for a same-/that-day reminder ping, on
  // top of the date in `deadline`. Null means no timed ping.
  dueTime?: string | null;
  referee?: Referee;
  cadence?: string | null;
};

// Per-user context for the classifier. Defaults keep the owner's (Jules's)
// behavior unchanged for any caller that doesn't pass it (e.g. the `try` CLI).
export type ClassifyContext = {
  name?: string;
  refereeLabels?: string[];
  // Whose call this is, for the cost log. Omitted by the `try` CLI so it logs
  // nothing (see `track` in usage.ts).
  userId?: number;
};
const DEFAULT_REFEREES = ["wife", "sister", "colleague"];

export type IntentAction =
  | "create"
  | "update"
  | "complete"
  | "snooze"
  | "retire"
  | "query"
  | "clarify";

export type Intent = {
  action: IntentAction;
  itemId: number | null;
  fields: ItemFields;
  snoozeDays: number | null;
  reply: string;
};

// Compact view of an open item, handed to the router so it can resolve a phrase
// like "push the dentist to Friday" to a concrete id by fuzzy title match.
export type OpenItemLite = {
  id: number;
  title: string;
  type: string;
  category: string | null;
  referee: string | null;
  deadline: string | null;
};

function buildSystem(name: string, refereeLabels: string[]): string {
  const refLine = refereeLabels.length
    ? `Referees this person can assign: ${refereeLabels.join(", ")}. Pick whichever best fits who should hold them accountable, or null.`
    : `No referees are set up yet, so leave referee null.`;
  return `You are Ember, a personal accountability agent for ${name}. You read one messy line and decide what they want done, then return it through the route tool.

What you know about ${name}:
- Their problem is follow-through, not capture. Every item should end up with teeth: a deadline, a referee, or both.
- ${refLine}
- Type is NOT set directly; it's derived from what you give the item. So decide the shape by setting the right field:
  - A concrete one-off action they avoid (dentist, paperwork): set a "deadline". It becomes a task. Always give one a deadline.
  - A big ongoing goal that recurs (build the company, upskill in AI): set a "cadence" ("weekly"/"monthly") and a referee, no deadline. It becomes a commitment.
  - A link, video, idea, restaurant, or trip for later: give it neither deadline nor cadence. It parks. If they say "in N weeks/days", set snoozeDays.
- If they name a specific clock time ("call mum at 3pm", "gym tonight at 7", "submit by 18:30"), set "dueTime" to 24h "HH:MM" AND set "deadline" to the day it lands on (today if unstated). They'll get a ping at that exact time on top of the daily digests. No time mentioned: leave dueTime null.
- "important" is your judgment of whether it matters to their goals, not its timing. Set it true for anything consequential. There is no urgency flag: urgency comes from the deadline alone.
- Categories, pick exactly one: "personal" (errands, admin, appointments, family, health paperwork), "finance" (money, bills, taxes, investing), "fitness" (training, gym, sleep), "work" (their main job and work deliverables), "business" (their own side business), "learning" (upskilling, courses, AI, reading).
- The death zone is important things with no date. An important item with no deadline falls into parking and rots, so if it's important, give it a deadline.

Deciding the action:
- "create": a genuinely new thing to track. Fill every field. This is the default when the message doesn't refer to anything already open.
- "update": change fields on an existing open item ("push the dentist to Friday", "the gym thing is weekly", "that's actually a work item", "referee my colleague on it"). Set itemId to the matched item and list ONLY the changed fields in updateMask, filling those fields. To clear a field, mask it and set it to null.
- "complete": they say they did it / finished it / it's done.
- "snooze": defer it. Set snoozeDays.
- "retire": kill it for good ("drop it", "forget it", "cancel that").
- "query": they're asking what's on their plate. Answer from the OPEN ITEMS list in reply; change nothing.
- "clarify": use this when an action targets an existing item but two or more open items plausibly match. Put a single, short disambiguating question in reply (name the candidates). Do NOT guess.

Resolving the target: match against the OPEN ITEMS list by title and context. Only set itemId to an id that appears in that list. If nothing matches an edit-style request, treat it as a create instead.

reply: a dry, direct one-line confirmation of what you did, echoing the concrete change ("Moved 'dentist' to Fri 20 Jun, marked urgent"). For clarify, it's the question. At most one emoji, no fluff. Resolve relative dates against TODAY.`;
}

function pickFields(raw: Record<string, unknown>, mask: string[] | null): ItemFields {
  const fields: ItemFields = {};
  const want = (k: string) => mask === null || mask.includes(k);
  if (want("title") && raw.title != null) fields.title = raw.title as string;
  if (want("type") && raw.type != null) fields.type = raw.type as ItemType;
  if (want("category") && raw.category != null) fields.category = raw.category as Category;
  if (want("important") && raw.important != null) fields.important = raw.important as boolean;
  // deadline / dueTime / referee / cadence are nullable: when masked, an explicit null means "clear it".
  if (want("deadline")) fields.deadline = (raw.deadline as string | null) ?? null;
  if (want("dueTime")) fields.dueTime = (raw.dueTime as string | null) ?? null;
  if (want("referee")) fields.referee = (raw.referee as Referee) ?? null;
  if (want("cadence")) fields.cadence = (raw.cadence as string | null) ?? null;
  return fields;
}

export async function interpret(
  text: string,
  today: string,
  openItems: OpenItemLite[],
  ctx: ClassifyContext = {}
): Promise<Intent> {
  const name = ctx.name || "Jules";
  const labels = ctx.refereeLabels ?? DEFAULT_REFEREES;
  const open = openItems.length
    ? openItems
        .map(
          (i) =>
            `#${i.id} ${i.title} [${i.type}` +
            (i.category ? `, ${i.category}` : "") +
            (i.referee ? `, ref:${i.referee}` : "") +
            (i.deadline ? `, due ${i.deadline}` : "") +
            `]`
        )
        .join("\n")
    : "(none open)";

  const res = await track(
    { source: "classify", provider: "anthropic", model: MODELS.classify, userId: ctx.userId },
    () =>
      anthropic.messages.create({
        model: MODELS.classify,
        max_tokens: 600,
        system: buildSystem(name, labels),
        messages: [
          {
            role: "user",
            content: `TODAY is ${today}.\n\nOPEN ITEMS:\n${open}\n\nMessage: ${text}`,
          },
        ],
        tools: [
          {
            name: "route",
            description: "Route the message to an action and carry any field values.",
            input_schema: {
              type: "object",
              properties: {
                action: {
                  type: "string",
                  enum: ["create", "update", "complete", "snooze", "retire", "query", "clarify"],
                },
                itemId: {
                  type: ["number", "null"],
                  description: "Target open item id for update/complete/snooze/retire; null otherwise",
                },
                updateMask: {
                  type: "array",
                  items: { type: "string" },
                  description: "For update: the field names to apply. Empty for other actions.",
                },
                title: { type: ["string", "null"] },
                type: { type: ["string", "null"], enum: ["task", "commitment", "parking", null] },
                category: {
                  type: ["string", "null"],
                  enum: ["personal", "finance", "fitness", "work", "business", "learning", null],
                },
                important: { type: ["boolean", "null"] },
                deadline: { type: ["string", "null"], description: "ISO date YYYY-MM-DD, or null" },
                dueTime: {
                  type: ["string", "null"],
                  description:
                    "Precise clock time as 24h HH:MM if they name one (e.g. '3pm'->'15:00', 'at 18:30'->'18:30'), else null. Set deadline to the day it falls on too.",
                },
                referee: { type: ["string", "null"], enum: [...labels, null] },
                cadence: { type: ["string", "null"], description: "e.g. monthly, weekly, or null" },
                snoozeDays: { type: ["number", "null"], description: "days to defer, or null" },
                reply: { type: "string", description: "one-line confirmation, or the clarifying question" },
              },
              required: ["action", "itemId", "updateMask", "reply"],
            },
          },
        ],
        tool_choice: { type: "tool", name: "route" },
      }),
    (r) => ({ usage: usageFromAnthropic(r.usage) })
  );

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No intent returned");
  const raw = block.input as Record<string, unknown>;

  const action = raw.action as IntentAction;
  const mask = action === "create" ? null : (raw.updateMask as string[] | undefined) ?? [];

  return {
    action,
    itemId: typeof raw.itemId === "number" ? raw.itemId : null,
    fields: pickFields(raw, mask),
    snoozeDays: typeof raw.snoozeDays === "number" ? raw.snoozeDays : null,
    reply: (raw.reply as string) ?? "Done.",
  };
}
