import { createLoginLinkToken } from "./auth";
import type { InlineButton } from "./telegram";

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
