import { prisma } from "./db";
import { sendMessage, type InlineKeyboard } from "./telegram";
import { buildDailyNudge, type Slot } from "./nudge";
import { isTimedNudgeDue, buildTimedNudge } from "./timed";
import { isCritical, startOfDayHKT } from "./rank";
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

// Did this user complete anything today (HKT)? Drives the evening "well done"
// note: with nothing left pending, a done event today means they cleared the
// day rather than never having anything due.
async function clearedSomethingToday(userId: number, now: Date): Promise<boolean> {
  const done = await prisma.event.findFirst({
    where: { kind: "done", createdAt: { gte: startOfDayHKT(now) }, item: { userId } },
  });
  return !!done;
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
  // on. The one exception: the evening wrap-up cheers a day where things were due
  // and you cleared them all (positive reinforcement, not an empty-state ping).
  if (!nudge) {
    if (slot === "evening" && (await clearedSomethingToday(user.id, now))) {
      await send(user.telegramChatId, "Well done. You cleared everything due today. 🔥");
      return true;
    }
    return false;
  }

  const top = live.find((i) => i.id === nudge.topId)!;

  // Referee escalation (the warning copy plus the auto "Tell <referee>" send) is
  // paused until WhatsApp auto-send is configured. Flip this flag to bring it
  // back; the ladder, the warning text, and the keyboard button return together.
  const ESCALATION_ENABLED: boolean = false;
  const ref = ESCALATION_ENABLED ? await getReferee(user.id, top.referee) : null;
  const step: EscalationStep = ESCALATION_ENABLED ? await escalationFor(top, now, ref) : "none";
  const willSend = ESCALATION_ENABLED && step === "send" && canAutoSend(ref);
  const ownerName = user.name || "Your friend";

  await send(user.telegramChatId, nudge.text, nudge.keyboard);

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

// M8 timed nudges. Driven by an external scheduler (a GitHub Action hitting
// /api/cron?slot=timed every ~15 min) because Vercel Hobby's two crons are both
// spent on the morning/evening digests. Fires each user's items whose precise
// dueAt has just arrived, exactly once (dueNudgedAt is the idempotency stamp).
// Independent of the digests and their accountability bookkeeping: a focused
// single-item ping, not a re-rank.
export async function runTimedSweep(
  now: Date = new Date(),
  send: Sender = sendMessage
): Promise<{ sent: number; users: number }> {
  const users = await prisma.user.findMany();
  let sent = 0;
  for (const user of users) {
    // Pre-filter in the DB; isTimedNudgeDue applies the time window + snooze.
    const due = await prisma.item.findMany({
      where: { status: "open", userId: user.id, dueAt: { not: null }, dueNudgedAt: null },
    });
    for (const item of due) {
      if (!isTimedNudgeDue(item, now)) continue;
      // One bad send shouldn't abort the rest of the sweep; an unstamped item just
      // retries on the next ~15-min tick (still inside the grace window).
      try {
        const nudge = buildTimedNudge(item, now);
        await send(user.telegramChatId, nudge.text, nudge.keyboard);
        await prisma.item.update({ where: { id: item.id }, data: { dueNudgedAt: now } });
        await prisma.event.create({ data: { itemId: item.id, kind: "nudged", slot: "timed" } });
        sent++;
      } catch {
        // best-effort; leave dueNudgedAt unset so the next tick re-attempts
      }
    }
  }
  return { sent, users: users.length };
}
