import { createLoginLinkToken } from "./auth";
import type { InlineButton } from "./telegram";

// A natural-language ask for the web board ("where's my board", "open board",
// "board link", "my dashboard") — so the link isn't tied to the exact /board
// command. Kept deliberately tight: the message must be essentially the board
// request itself, so a real task like "prep the board meeting deck" still falls
// through to the AI router and becomes an item.
export function wantsBoardLink(text: string): boolean {
  const t = text.toLowerCase().replace(/[?.!,]+$/g, "").trim();
  if (!/\b(board|dashboard)\b/.test(t)) return false;
  return [
    /^\/?(board|dashboard)$/,
    /^(my|the) (board|dashboard)$/,
    /^(board|dashboard) link$/,
    /^link (to|for) (my|the) (board|dashboard)$/,
    /^(can|could) (you|i) .*(board|dashboard)( link)?$/,
    /^(pls |please )?(open|see|show|view|find|get|access|send|give)( me)?( my| the)? (board|dashboard)( link)?$/,
    /^where(?:'s|s| is| are| do i find| do i see| can i find| can i see)?\s+(my |the )?(board|dashboard)( link)?$/,
  ].some((re) => re.test(t));
}

// A "See your board" button: a fresh login link bound to this user. Rides every
// nudge and the bot's /board reply so the dashboard is always one tap away, with
// no command to remember. Returns null when APP_SECRET/APP_URL aren't set, so the
// message still sends without it.
export async function boardLinkButton(userId: number): Promise<InlineButton | null> {
  const secret = process.env.APP_SECRET;
  const base = process.env.APP_URL;
  if (!secret || !base) return null;
  const token = await createLoginLinkToken(userId, secret);
  return { text: "See your board", url: `${base}/login/${token}` };
}
