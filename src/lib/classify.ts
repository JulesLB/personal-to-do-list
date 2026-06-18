import { anthropic, MODELS } from "./anthropic";

export type Category =
  | "personal"
  | "finance"
  | "fitness"
  | "work"
  | "business"
  | "learning";

export type Classified = {
  title: string;
  type: "task" | "commitment" | "parking";
  category: Category;
  important: boolean;
  urgent: boolean;
  deadline: string | null;
  referee: "wife" | "sister" | "colleague" | null;
  cadence: string | null;
  snoozeDays: number | null;
  reply: string;
};

const SYSTEM = `You are Hermes, a personal accountability agent for Jules. You turn one messy line into a structured item.

What you know about Jules:
- His problem is follow-through, not capture. Every item should end up with teeth: a deadline, a referee, or both.
- Referees: "wife" for daily and avoided chores, "sister" for big life goals, "colleague" for work goals. Pick the best fit or null.
- Types:
  - "task": a concrete action, often one he avoids (dentist, paperwork). Usually important. Give it a deadline.
  - "commitment": a big ongoing goal (build the company, upskill in AI). Set a cadence ("monthly") and a referee.
  - "parking": a link, video, idea, restaurant, or trip for later. Not urgent. If he says "in N weeks/days", set snoozeDays.
- Categories, pick exactly one:
  - "personal": errands, admin, appointments, family, health paperwork (dentist).
  - "finance": money, bills, expenses, taxes, investing.
  - "fitness": training, gym, sleep, physical health.
  - "work": the Capgemini day job and client deliverables.
  - "business": his own side business and company building.
  - "learning": upskilling, courses, AI, reading.
- The death zone is important-but-not-urgent. If something is important with no deadline, lean toward giving it one.

Resolve relative dates against TODAY. Keep the title short and action-first. Write a dry, direct one-line reply confirming what you logged. No fluff, at most one emoji.`;

export async function classify(text: string, today: string): Promise<Classified> {
  const res = await anthropic.messages.create({
    model: MODELS.classify,
    max_tokens: 600,
    system: SYSTEM,
    messages: [{ role: "user", content: `TODAY is ${today}.\n\nNote: ${text}` }],
    tools: [
      {
        name: "save_item",
        description: "Save the structured item parsed from the note.",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            type: { type: "string", enum: ["task", "commitment", "parking"] },
            category: {
              type: "string",
              enum: ["personal", "finance", "fitness", "work", "business", "learning"],
            },
            important: { type: "boolean" },
            urgent: { type: "boolean" },
            deadline: { type: ["string", "null"], description: "ISO date YYYY-MM-DD, or null" },
            referee: { type: ["string", "null"], enum: ["wife", "sister", "colleague", null] },
            cadence: { type: ["string", "null"], description: "e.g. monthly, weekly, or null" },
            snoozeDays: { type: ["number", "null"], description: "days to defer a parking item, or null" },
            reply: { type: "string", description: "one-line confirmation to send back" },
          },
          required: [
            "title",
            "type",
            "category",
            "important",
            "urgent",
            "deadline",
            "referee",
            "cadence",
            "snoozeDays",
            "reply",
          ],
        },
      },
    ],
    tool_choice: { type: "tool", name: "save_item" },
  });

  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("No classification returned");
  return block.input as unknown as Classified;
}
