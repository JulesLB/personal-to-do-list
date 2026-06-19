import type { InlineKeyboard } from "./telegram";
import { waLink } from "./waLink";
import {
  rankActionable,
  deadlineLabel,
  cadenceLabel,
  commitmentDueLabel,
  heatOf,
  daysOverdue,
  isCritical,
  promisedToday,
  CATEGORIES,
  type Category,
} from "./rank";
import type { Item } from "@prisma/client";

const DOT = "·";
const BULLET = "•";

type Tier = "calm" | "push" | "escalate";
export type Slot = "morning" | "evening";

const catLabel = (c: string | null) =>
  c && c in CATEGORIES ? CATEGORIES[c as Category].label : null;

// "calm" = top of the list, nothing on fire. "push" = burning, due today or
// just past. "escalate" = ignored long enough to call in the referee.
function tierOf(it: Item, now: Date): Tier {
  if (isCritical(it, now)) return "escalate";
  if (heatOf(it, now) === "burning") return "push";
  return "calm";
}

export type DailyNudge = { text: string; keyboard: InlineKeyboard; topId: number };

function escalationDraft(it: Item, now: Date): string {
  if (it.type === "commitment") {
    const cad = cadenceLabel(it.cadence);
    return `Accountability check: I committed to "${it.title}"${cad ? ` (${cad})` : ""} and I've let it slide. Calling it out so you hold me to it.`;
  }
  const when = deadlineLabel(it.deadline, now) ?? "a while back";
  return `Accountability check: I said I'd "${it.title}" (${when}) and I haven't. Calling it out so you hold me to it.`;
}

// One-line meta under a title: category, when, cadence, referee.
function metaLine(it: Item, now: Date, withReferee: boolean): string {
  return [
    catLabel(it.category),
    it.type === "commitment" ? commitmentDueLabel(it, now) : deadlineLabel(it.deadline, now),
    it.type === "commitment" ? cadenceLabel(it.cadence) : null,
    withReferee && it.referee ? `referee: ${it.referee}` : null,
  ]
    .filter(Boolean)
    .join(` ${DOT} `);
}

function onDeck(it: Item, now: Date): string {
  const meta = metaLine(it, now, false);
  return `${BULLET} ${it.title}${meta ? ` ${DOT} ${meta}` : ""}`;
}

function brokenPromiseHeader(it: Item): string {
  const jab = it.referee ? `Tell your ${it.referee} or get it done.` : `Own it before bed.`;
  return `Morning-you promised "${it.title}" today. Evening-you hasn't. ${jab}`;
}

function header(it: Item, tier: Tier, slot: Slot, now: Date, broken: boolean): string {
  if (broken) return brokenPromiseHeader(it);
  if (tier === "escalate") {
    if (it.type === "commitment") {
      return it.referee
        ? `You've let "${it.title}" slide. Time to tell your ${it.referee}.`
        : `You've let "${it.title}" slide. Own it today.`;
    }
    const n = daysOverdue(it, now);
    const lead = `Your #1 is ${n} day${n === 1 ? "" : "s"} overdue.`;
    return it.referee ? `${lead} Time to tell your ${it.referee}.` : `${lead} Call it in.`;
  }
  if (tier === "push") {
    if (slot === "evening") return "Evening check. Your #1 is still open.";
    return it.type === "commitment" ? `You're overdue on "${it.title}".` : "Your #1 is burning.";
  }
  return slot === "evening" ? "Still on the list tonight." : "Top of the list today.";
}

function buttons(it: Item, tier: Tier, now: Date, broken: boolean): InlineKeyboard {
  const done = { text: "✓ Done", callback_data: `done:${it.id}` };
  const today = { text: "I'll do it today", callback_data: `today:${it.id}` };
  const link = waLink(it.referee, escalationDraft(it, now));
  const tell = link && it.referee ? { text: `Tell ${it.referee}`, url: link } : null;

  if (broken || tier === "escalate") {
    // Referee goes first: the point is the social cost, not the checkbox.
    return { inline_keyboard: [tell ? [tell, done, today] : [done, today]] };
  }
  if (tier === "push") {
    return { inline_keyboard: [tell ? [done, today, tell] : [done, today]] };
  }
  // calm: nothing's on fire, so offer to defer with intent.
  const snooze = [
    { text: "Tonight", callback_data: `snz:${it.id}:tonight` },
    { text: "Tomorrow", callback_data: `snz:${it.id}:tomorrow` },
    { text: "Weekend", callback_data: `snz:${it.id}:weekend` },
    { text: "Next wk", callback_data: `snz:${it.id}:nextweek` },
  ];
  return { inline_keyboard: [[done], snooze] };
}

export function buildDailyNudge(
  items: Item[],
  now: Date,
  slot: Slot = "morning"
): DailyNudge | null {
  const ranked = rankActionable(items, now);
  if (!ranked.length) return null;

  let it = ranked[0].item;
  let broken = false;

  if (slot === "evening") {
    // A promise you made this morning and still haven't kept wins the evening,
    // even if it isn't the top-ranked item. That's the one that gets attitude.
    const promise = ranked.find((r) => promisedToday(r.item, now));
    if (promise) {
      it = promise.item;
      broken = true;
    } else if (tierOf(ranked[0].item, now) === "calm") {
      // Otherwise the evening is just an honesty check: stay quiet if nothing
      // is actually pressing.
      return null;
    }
  }

  const tier = tierOf(it, now);
  const label = broken ? "Still open" : "#1";
  const meta = metaLine(it, now, true);
  let text = `${header(it, tier, slot, now, broken)}\n\n${label} ${DOT} ${it.title}`;
  if (meta) text += `\n${meta}`;

  const next = ranked.filter((r) => r.item.id !== it.id).slice(0, 2);
  if (next.length) text += `\n\nWhat's next\n${next.map((r) => onDeck(r.item, now)).join("\n")}`;

  return { text, keyboard: buttons(it, tier, now, broken), topId: it.id };
}
