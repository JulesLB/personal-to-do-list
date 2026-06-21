import { prisma } from "./db";
import { sendMessage, type InlineKeyboard } from "./telegram";
import { buildDailyNudge, type Slot } from "./nudge";
import { isCritical } from "./rank";
import { escalationStep, type EscalationStep } from "./escalate";
import { getReferee, isOptedInReferee, canAutoSend, sendToReferee } from "./referee";
import type { Item, Referee, User } from "@prisma/client";

export type { Slot };

// Resolve the ladder rung for the item we're nudging. Short-circuits before
// touching the Event table when there's nothing to escalate, so a quiet item
// (and the existing sweep tests) never query events. The referee row is fetched
// by the caller (per-user) and passed in.
async function escalationFor(
  item: Item,
  now: Date,
  ref: Referee | null
): Promise<EscalationStep> {
  if (!item.important || !isCritical(item, now)) return "none";
  if (!isOptedInReferee(ref)) return "none";
  // A commitment resets each honored cycle, so only count warnings/sends since
  // the current cycle's anchor; a task's anchor is its creation.
  const anchor = item.lastDoneAt ?? item.createdAt;
  const [warned, sent] = await Promise.all([
    prisma.event.findFirst({
      where: { itemId: item.id, kind: "escalation_warned", createdAt: { gt: anchor } },
    }),
    prisma.event.findFirst({
      where: { itemId: item.id, kind: "told_referee", createdAt: { gt: anchor } },
    }),
  ]);
  return escalationStep({
    item,
    now,
    optedIn: true,
    alreadyWarned: !!warned,
    alreadySent: !!sent,
  });
}

// The channel the sweep sends through. Defaults to Telegram; the preview script
// injects a no-op that captures the message so it can dry-run against a local DB.
export type Sender = (
  chatId: string | number,
  text: string,
  replyMarkup?: InlineKeyboard
) => Promise<unknown>;

// Nudge a single user: read their open items, build the nudge, fold in any
// referee escalation, send to their chat, and write accountability memory.
// Returns whether a message went out. buildDailyNudge stays pure; the side
// effects live here.
async function sweepUser(
  user: User,
  now: Date,
  slot: Slot,
  send: Sender
): Promise<boolean> {
  const items = await prisma.item.findMany({ where: { status: "open", userId: user.id } });
  const live = items.filter((i) => !(i.snoozeUntil && i.snoozeUntil > now));

  const nudge = buildDailyNudge(live, now, slot);
  // Both slots stay silent when nothing is pressing. A ping on a quiet day teaches
  // the user to swipe the bot away unread, spending the trust the nudge depends
  // on. The "clean slate" win moves to the weekly receipts (M3).
  if (!nudge) return false;

  // Decide whether this nudge also pulls the referee in, before we send so the
  // warning rides along in the same message.
  const top = live.find((i) => i.id === nudge.topId)!;
  const ref = await getReferee(user.id, top.referee);
  const step = await escalationFor(top, now, ref);
  const willSend = step === "send" && canAutoSend(ref);
  const ownerName = user.name || "Your friend";

  let text = nudge.text;
  if (step === "warn") {
    text += `\n\nLast warning. Tap it, or next time I message your ${top.referee} myself.`;
  } else if (step === "send" && !willSend) {
    // The rung says send, but WhatsApp isn't wired up. Degrade to the one-tap
    // draft already on the keyboard rather than going silent or lying.
    text += `\n\nI'd message your ${top.referee} now, but WhatsApp auto-send isn't set up. Tap the button to send it yourself.`;
  }

  await send(user.telegramChatId, text, nudge.keyboard);

  // Accountability memory: a re-nudge of a still-open item means the last nudge
  // was ignored (done and snooze remove an item; a kept promise gets marked done).
  const ignored = !!top.lastNudgedAt;
  await prisma.item.update({
    where: { id: nudge.topId },
    data: {
      lastNudgedAt: now,
      nudgeCount: { increment: 1 },
      ...(ignored ? { ignoreCount: { increment: 1 } } : {}),
    },
  });
  await prisma.event.create({ data: { itemId: nudge.topId, kind: "nudged", slot } });

  if (step === "warn") {
    await prisma.event.create({ data: { itemId: top.id, kind: "escalation_warned", slot } });
  }
  if (willSend && ref) {
    const res = await sendToReferee(ref, top, ownerName);
    if (res.ok) {
      await prisma.event.create({ data: { itemId: top.id, kind: "told_referee", slot } });
      await send(
        user.telegramChatId,
        `Done. I just messaged your ${top.referee}. Here's what I sent:\n\n"${res.rendered}"`
      );
    } else {
      await send(
        user.telegramChatId,
        `Tried to message your ${top.referee} but the WhatsApp send failed. Check the setup.`
      );
    }
  }

  return true;
}

// The side-effecting wrapper the cron calls. Sweeps every user, sending each
// their own top item.
export async function runSweep(
  slot: Slot = "morning",
  send: Sender = sendMessage
): Promise<{ sent: number; users: number }> {
  const now = new Date();
  const users = await prisma.user.findMany();
  let sent = 0;
  for (const user of users) {
    if (await sweepUser(user, now, slot, send)) sent++;
  }
  return { sent, users: users.length };
}
