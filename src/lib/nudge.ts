import type { InlineButton, InlineKeyboard } from "./telegram";
import {
  rankActionable,
  deadlineLabel,
  cadenceLabel,
  commitmentDueLabel,
  daysOverdue,
} from "./rank";
import { DEFAULT_TZ } from "./datetime";
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

// One-line meta under a title: when (overdue only), cadence. The due date is
// shown only when it adds something: in the Overdue section the "Nd overdue"
// reads, but under "Due
// today" every item is due today, so repeating it is just noise — there showDate
// is false and a plain task collapses to its bare title.
function metaLine(it: Item, now: Date, showDate: boolean, tz: string): string {
  return [
    showDate
      ? it.type === "commitment"
        ? commitmentDueLabel(it, now, tz)
        : deadlineLabel(it.deadline, now, tz)
      : null,
    it.type === "commitment" ? cadenceLabel(it.cadence) : null,
  ]
    .filter(Boolean)
    .join(` ${DOT} `);
}

function lineItem(it: Item, now: Date, marker: string, showDate: boolean, tz: string): string {
  const meta = metaLine(it, now, showDate, tz);
  return `${marker} ${it.title}${meta ? ` ${DOT} ${meta}` : ""}`;
}

// Morning is a plain preview of the day (no buttons — you don't tick in the
// morning, you plan). Evening is the wrap-up: numbered list + a tick grid. The
// section headers already carry the counts, so the intro stays a bare question.
function header(slot: Slot): string {
  return slot === "evening" ? "What's still pending?" : "What's up today?";
}

export function buildDailyNudge(
  items: Item[],
  now: Date,
  slot: Slot = "morning",
  tz: string = DEFAULT_TZ
): DailyNudge | null {
  const ranked = rankActionable(items, now, tz).map((r) => r.item);
  const overdue = ranked.filter((it) => daysOverdue(it, now, tz) > 0);
  const today = ranked.filter((it) => daysOverdue(it, now, tz) === 0);
  if (!overdue.length && !today.length) return null;

  const shownOverdue = overdue.slice(0, SECTION_CAP);
  const shownToday = today.slice(0, SECTION_CAP);
  const shown = [...shownOverdue, ...shownToday];
  const evening = slot === "evening";

  // Evening numbers each line (1..N) so a compact "✓ N" button maps to its row;
  // morning just bullets them.
  let counter = 0;
  const section = (
    icon: string,
    label: string,
    list: Item[],
    total: number,
    showDate: boolean
  ): string => {
    const lines = list.map((it) =>
      lineItem(it, now, evening ? `${++counter}.` : BULLET, showDate, tz)
    );
    let s = `${icon} ${label} (${total})\n${lines.join("\n")}`;
    const extra = total - list.length;
    if (extra > 0) s += `\n+${extra} more`;
    return s;
  };

  let text = header(slot);
  const blocks: string[] = [];
  if (shownOverdue.length) blocks.push(section("🔴", "Overdue", shownOverdue, overdue.length, true));
  if (shownToday.length) blocks.push(section("📅", "Due today", shownToday, today.length, false));
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
