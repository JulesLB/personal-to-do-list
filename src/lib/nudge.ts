import type { InlineButton, InlineKeyboard } from "./telegram";
import {
  rankActionable,
  deadlineLabel,
  cadenceLabel,
  commitmentDueLabel,
  daysOverdue,
  CATEGORIES,
  type Category,
} from "./rank";
import type { Item } from "@prisma/client";

const DOT = "·";
const BULLET = "•";

// At most this many items per section. Three overdue + three due today keeps the
// message scannable and the evening tick grid inside Telegram's comfortable size.
// Everything past the cap rolls into a "+N more" line; nothing below "due today"
// (future, back burner, parking) shows at all.
const SECTION_CAP = 3;

export type Slot = "morning" | "evening";
export type DailyNudge = { text: string; keyboard?: InlineKeyboard; topId: number };

const catLabel = (c: string | null) =>
  c && c in CATEGORIES ? CATEGORIES[c as Category].label : null;

// One-line meta under a title: category, when, cadence.
function metaLine(it: Item, now: Date): string {
  return [
    catLabel(it.category),
    it.type === "commitment" ? commitmentDueLabel(it, now) : deadlineLabel(it.deadline, now),
    it.type === "commitment" ? cadenceLabel(it.cadence) : null,
  ]
    .filter(Boolean)
    .join(` ${DOT} `);
}

function lineItem(it: Item, now: Date, marker: string): string {
  const meta = metaLine(it, now);
  return `${marker} ${it.title}${meta ? ` ${DOT} ${meta}` : ""}`;
}

// "3 overdue, 2 due today" / "2 overdue" / "2 due today".
function summary(overdue: number, today: number): string {
  const parts: string[] = [];
  if (overdue) parts.push(`${overdue} overdue`);
  if (today) parts.push(`${today} due today`);
  return parts.join(", ");
}

// Morning is a plain preview of the day (no buttons — you don't tick in the
// morning, you plan). Evening is the wrap-up: numbered list + a tick grid.
function header(slot: Slot, overdue: number, today: number): string {
  const sum = summary(overdue, today);
  return slot === "evening"
    ? `That was today. Still pending: ${sum}.`
    : `Morning. ${sum}.`;
}

export function buildDailyNudge(
  items: Item[],
  now: Date,
  slot: Slot = "morning"
): DailyNudge | null {
  const ranked = rankActionable(items, now).map((r) => r.item);
  const overdue = ranked.filter((it) => daysOverdue(it, now) > 0);
  const today = ranked.filter((it) => daysOverdue(it, now) === 0);
  if (!overdue.length && !today.length) return null;

  const shownOverdue = overdue.slice(0, SECTION_CAP);
  const shownToday = today.slice(0, SECTION_CAP);
  const shown = [...shownOverdue, ...shownToday];
  const evening = slot === "evening";

  // Evening numbers each line (1..N) so a compact "✓ N" button maps to its row;
  // morning just bullets them.
  let counter = 0;
  const section = (icon: string, label: string, list: Item[], total: number): string => {
    const lines = list.map((it) => lineItem(it, now, evening ? `${++counter}.` : BULLET));
    let s = `${icon} ${label} (${total})\n${lines.join("\n")}`;
    const extra = total - list.length;
    if (extra > 0) s += `\n+${extra} more`;
    return s;
  };

  let text = header(slot, overdue.length, today.length);
  const blocks: string[] = [];
  if (shownOverdue.length) blocks.push(section("🔴", "Overdue", shownOverdue, overdue.length));
  if (shownToday.length) blocks.push(section("📅", "Due today", shownToday, today.length));
  text += `\n\n${blocks.join("\n\n")}`;

  const topId = shown[0].id;
  if (!evening) return { text, topId };

  // A grid of numbered ticks, three per row. Tapping one burns that item.
  const rows: InlineButton[][] = [];
  shown.forEach((it, i) => {
    const btn: InlineButton = { text: `✓ ${i + 1}`, callback_data: `done:${it.id}` };
    if (i % 3 === 0) rows.push([btn]);
    else rows[rows.length - 1].push(btn);
  });
  return { text, keyboard: { inline_keyboard: rows }, topId };
}
