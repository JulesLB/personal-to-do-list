import { prisma } from "./db";
import { sendMessage, type InlineKeyboard } from "./telegram";
import { buildDailyNudge, type Slot } from "./nudge";
import { isTimedNudgeDue, buildTimedNudge } from "./timed";
import { isCritical } from "./rank";
import { DEFAULT_TZ, hourInTz, isoDate, startOfDay } from "./datetime";
import { escalationStep, type EscalationStep } from "./escalate";
import { getReferee, isOptedInReferee, canAutoSend, sendToReferee } from "./referee";
import { boardLinkButton } from "./boardLink";
import type { Item, Referee, User } from "@prisma/client";

// Append the per-user "See your board" button as its own row beneath whatever
// keyboard the nudge already carries (the evening tick grid, or nothing in the
// morning). Degrades to the original keyboard when no link can be minted.
async function withBoardLink(
  userId: number,
  keyboard?: InlineKeyboard
): Promise<InlineKeyboard | undefined> {
  const btn = await boardLinkButton(userId);
  if (!btn) return keyboard;
  return { inline_keyboard: [...(keyboard?.inline_keyboard ?? []), [btn]] };
}

export type { Slot };

// Resolve the ladder rung for the item we're nudging. Short-circuits before
// touching the Event table when there's nothing to escalate, so a quiet item
// (and the existing sweep tests) never query events. The referee row is fetched
// by the caller (per-user) and passed in.
async function escalationFor(
  item: Item,
  now: Date,
  ref: Referee | null,
  tz: string
): Promise<EscalationStep> {
  if (!item.important || !isCritical(item, now, tz)) return "none";
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
async function clearedSomethingToday(userId: number, now: Date, tz: string): Promise<boolean> {
  const done = await prisma.event.findFirst({
    where: { kind: "done", createdAt: { gte: startOfDay(now, tz) }, item: { userId } },
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
  const tz = user.timezone || DEFAULT_TZ;
  const items = await prisma.item.findMany({ where: { status: "open", userId: user.id } });
  const live = items.filter((i) => !(i.snoozeUntil && i.snoozeUntil > now));

  const nudge = buildDailyNudge(live, now, slot, tz);
  // Both slots stay silent when nothing is pressing. A ping on a quiet day teaches
  // the user to swipe the bot away unread, spending the trust the nudge depends
  // on. The one exception: the evening wrap-up cheers a day where things were due
  // and you cleared them all (positive reinforcement, not an empty-state ping).
  if (!nudge) {
    if (slot === "evening" && (await clearedSomethingToday(user.id, now, tz))) {
      await send(
        user.telegramChatId,
        "Good job clearing everything today. 🔥",
        await withBoardLink(user.id)
      );
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
  const step: EscalationStep = ESCALATION_ENABLED ? await escalationFor(top, now, ref, tz) : "none";
  const willSend = ESCALATION_ENABLED && step === "send" && canAutoSend(ref);
  const ownerName = user.name || "Your friend";

  await send(user.telegramChatId, nudge.text, await withBoardLink(user.id, nudge.keyboard));

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

// Force a digest to every user regardless of their local clock. Kept for manual
// or forced sends (e.g. `/api/cron?slot=morning`) and the tests; the live cron
// drives delivery through runDigestTick, which respects each user's timezone.
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

// PRD-18: the digest delivery driver, called every ~5 min by the external
// scheduler. For each user it asks "is it 08:00 (or 20:00) where you are, and
// haven't I sent that digest today?" and fires the matching slot once per local
// day. A late or skipped tick still catches up: the window stays open for
// CATCHUP_HOURS past the target hour, and the per-user date marker (stamped
// before the send) keeps it to exactly one send even if ticks overlap.
const MORNING_HOUR = 8;
const EVENING_HOUR = 20;
const CATCHUP_HOURS = 3;

export async function runDigestTick(
  now: Date = new Date(),
  send: Sender = sendMessage
): Promise<{ sent: number; users: number }> {
  const users = await prisma.user.findMany();
  let sent = 0;
  for (const user of users) {
    const tz = user.timezone || DEFAULT_TZ;
    const hour = hourInTz(now, tz);
    const today = isoDate(now, tz);

    let slot: Slot | null = null;
    let marker: "lastMorningNudgeOn" | "lastEveningNudgeOn" | null = null;
    if (hour >= MORNING_HOUR && hour < MORNING_HOUR + CATCHUP_HOURS && user.lastMorningNudgeOn !== today) {
      slot = "morning";
      marker = "lastMorningNudgeOn";
    } else if (
      hour >= EVENING_HOUR &&
      hour < EVENING_HOUR + CATCHUP_HOURS &&
      user.lastEveningNudgeOn !== today
    ) {
      slot = "evening";
      marker = "lastEveningNudgeOn";
    }
    if (!slot || !marker) continue;

    // One user's failed send must not abort the sweep for everyone else on the
    // tick. Stamp the marker before sending so an overlapping tick can't
    // double-fire; a missed digest waits for the next day, it never spams.
    try {
      await prisma.user.update({ where: { id: user.id }, data: { [marker]: today } });
      if (await sweepUser(user, now, slot, send)) sent++;
    } catch {
      // swallow; the next tick re-evaluates (and the marker, if it was set, holds)
    }
  }
  return { sent, users: users.length };
}

// M8 timed nudges. Driven by an external scheduler (a GitHub Action hitting
// /api/cron?slot=timed every 5 min) because Vercel Hobby's two crons are both
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
    const tz = user.timezone || DEFAULT_TZ;
    // Pre-filter in the DB; isTimedNudgeDue applies the time window + snooze.
    const due = await prisma.item.findMany({
      where: { status: "open", userId: user.id, dueAt: { not: null }, dueNudgedAt: null },
    });
    for (const item of due) {
      if (!isTimedNudgeDue(item, now)) continue;
      // One bad send shouldn't abort the rest of the sweep; an unstamped item just
      // retries on the next 5-min tick (still inside the grace window).
      try {
        const nudge = buildTimedNudge(item, now, tz);
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
