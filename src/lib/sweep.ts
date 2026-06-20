import { prisma } from "./db";
import { sendMessage, type InlineKeyboard } from "./telegram";
import { buildDailyNudge, type Slot } from "./nudge";
import { isCritical } from "./rank";
import { escalationStep, type EscalationStep } from "./escalate";
import { isOptedInReferee, canAutoSend, sendToReferee } from "./referee";
import type { Item } from "@prisma/client";

export type { Slot };

// Resolve the ladder rung for the item we're nudging. Short-circuits before
// touching the Event table when there's nothing to escalate, so a quiet item
// (and the existing sweep tests) never query events.
async function escalationFor(item: Item, now: Date): Promise<EscalationStep> {
  if (!item.important || !isCritical(item, now)) return "none";
  if (!item.referee || !isOptedInReferee(item.referee)) return "none";
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

// The side-effecting wrapper the cron calls. buildDailyNudge stays pure; every
// DB read, send, and accountability-memory write lives here.
export async function runSweep(
  slot: Slot = "morning",
  send: Sender = sendMessage
): Promise<{
  sent: number;
  chatId: string | null;
  topId: number | null;
}> {
  const setting = await prisma.setting.findUnique({ where: { key: "ownerChatId" } });
  const chatId = setting?.value ?? process.env.OWNER_CHAT_ID ?? null;
  if (!chatId) return { sent: 0, chatId: null, topId: null };

  const now = new Date();
  const items = await prisma.item.findMany({ where: { status: "open" } });
  const live = items.filter((i) => !(i.snoozeUntil && i.snoozeUntil > now));

  const nudge = buildDailyNudge(live, now, slot);
  if (!nudge) {
    // Both slots stay silent when nothing is pressing. A ping on a quiet day
    // teaches the user to swipe the bot away unread, spending the trust the
    // nudge depends on. The "clean slate" win moves to the weekly receipts (M3).
    return { sent: 0, chatId, topId: null };
  }

  // Decide whether this nudge also pulls the referee in, before we send so the
  // warning rides along in the same message.
  const top = live.find((i) => i.id === nudge.topId)!;
  const step = await escalationFor(top, now);
  const willSend = step === "send" && canAutoSend(top.referee);

  let text = nudge.text;
  if (step === "warn") {
    text += `\n\nLast warning. Tap it, or next time I message your ${top.referee} myself.`;
  } else if (step === "send" && !willSend) {
    // The rung says send, but WhatsApp isn't wired up. Degrade to the one-tap
    // draft already on the keyboard rather than going silent or lying.
    text += `\n\nI'd message your ${top.referee} now, but WhatsApp auto-send isn't set up. Tap the button to send it yourself.`;
  }

  await send(chatId, text, nudge.keyboard);

  // Accountability memory: if the item we're nudging was already nudged before
  // and is still open, the last nudge was ignored. Done and snooze remove an
  // item from the list; a kept promise gets marked done. So a re-nudge is the
  // signal that you bounced it.
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
  if (willSend) {
    const res = await sendToReferee(top.referee!, top);
    if (res.ok) {
      await prisma.event.create({ data: { itemId: top.id, kind: "told_referee", slot } });
      await send(
        chatId,
        `Done. I just messaged your ${top.referee}. Here's what I sent:\n\n"${res.rendered}"`
      );
    } else {
      await send(
        chatId,
        `Tried to message your ${top.referee} but the WhatsApp send failed. Check the setup.`
      );
    }
  }

  return { sent: 1, chatId, topId: nudge.topId };
}
