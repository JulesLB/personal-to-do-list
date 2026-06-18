import { prisma } from "./db";
import { sendMessage, type InlineKeyboard } from "./telegram";
import { buildDailyNudge, type Slot } from "./nudge";

export type { Slot };

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
    // Morning always reports in; evening stays silent when nothing is pressing.
    if (slot === "morning") {
      await send(chatId, "Nothing pressing. Clean slate. Text me something to chase.");
    }
    return { sent: 0, chatId, topId: null };
  }

  await send(chatId, nudge.text, nudge.keyboard);

  // Accountability memory: if the item we're nudging was already nudged before
  // and is still open, the last nudge was ignored. Done and snooze remove an
  // item from the list; a kept promise gets marked done. So a re-nudge is the
  // signal that you bounced it. Escalation (Phase 2) reads ignoreCount.
  const top = live.find((i) => i.id === nudge.topId);
  const ignored = !!top?.lastNudgedAt;
  await prisma.item.update({
    where: { id: nudge.topId },
    data: {
      lastNudgedAt: now,
      nudgeCount: { increment: 1 },
      ...(ignored ? { ignoreCount: { increment: 1 } } : {}),
    },
  });
  await prisma.event.create({ data: { itemId: nudge.topId, kind: "nudged", slot } });

  return { sent: 1, chatId, topId: nudge.topId };
}
