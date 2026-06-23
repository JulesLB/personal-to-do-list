import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage, answerCallback, editMessageText, type InlineKeyboard } from "@/lib/telegram";
import { buildDailyNudge } from "@/lib/nudge";
import { interpret, type OpenItemLite } from "@/lib/classify";
import { createRefereeToken, createLoginLinkToken, passwordMatches } from "@/lib/auth";
import { transcribeVoice } from "@/lib/voice";
import { snoozeUntil, snoozeLabel, isSnoozePreset } from "@/lib/snooze";
import { deriveType, isoHKT, nowLabelHKT } from "@/lib/rank";
import { resolveUser, refereeLabels, isOwnerUser } from "@/lib/user";
import { botRateLimited, recordBotMessage } from "@/lib/ratelimit";
import { overMonthlyBudget } from "@/lib/usage";
import { clampTitle, normalizeCategory } from "@/lib/validate";
import {
  extractName,
  isOnboarding,
  welcomeMessage,
  returningMessage,
  orientationMessage,
  helpMessage,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

const ok = () => NextResponse.json({ ok: true });

// Deadlines live at 09:00 HKT so "due today" never drifts on the UTC server.
const toDeadline = (d: string | null | undefined) =>
  d ? new Date(d + "T09:00:00+08:00") : null;

// M8: a precise reminder instant. Combine the day (a YYYY-MM-DD, defaulting to
// today HKT) with a 24h HH:MM clock time, both interpreted in HKT.
const toDueAt = (day: string | null | undefined, time: string) =>
  new Date(`${day || isoHKT(new Date())}T${time}:00+08:00`);

const logEvent = (itemId: number, kind: string) =>
  prisma.event.create({ data: { itemId, kind } }).catch(() => {});

// A one-tap "Open your board" button: a fresh, single-use login link bound to this
// user. Attached to the welcome and /board so the dashboard is one tap from the
// chat, no command to remember (the landing's get-started flow leans on this).
// Returns undefined when APP_SECRET/APP_URL aren't set, so the message still sends.
const boardLinkKeyboard = async (userId: number): Promise<InlineKeyboard | undefined> => {
  const secret = process.env.APP_SECRET;
  const base = process.env.APP_URL;
  if (!secret || !base) return undefined;
  const token = await createLoginLinkToken(userId, secret);
  return { inline_keyboard: [[{ text: "Open your board →", url: `${base}/login/${token}` }]] };
};

// Completing a commitment honors the current cycle and resets its clock; it
// stays open and resurfaces a cadence period later. Tasks close for good. Scoped
// by userId so one chat can never complete another user's item by guessing its id.
async function completeItem(id: number, userId: number): Promise<void> {
  const item = await prisma.item.findFirst({ where: { id, userId } });
  if (!item) return;
  if (item.type === "commitment") {
    // A fresh cycle starts clean, so the push tally resets too.
    await prisma.item.update({
      where: { id },
      data: {
        lastDoneAt: new Date(),
        lastNudgedAt: null,
        promisedAt: null,
        cycleStreak: { increment: 1 },
        deferCount: 0,
      },
    });
  } else {
    await prisma.item.update({ where: { id }, data: { status: "done", doneAt: new Date() } });
  }
  await logEvent(id, "done");
}

// After a tick on the daily nudge, rebuild the digest and edit the message so the
// burned item drops out and the section counts tick down. When nothing is left
// overdue or due today, the message becomes a short all-clear with no buttons.
// Best-effort: a failed edit (or a missing message) never breaks the callback.
async function rerenderNudge(
  userId: number,
  message: { message_id?: number; chat?: { id?: number | string } } | undefined
): Promise<void> {
  if (!message?.message_id || message.chat?.id == null) return;
  const now = new Date();
  const items = await prisma.item.findMany({ where: { status: "open", userId } });
  const live = items.filter((i) => !(i.snoozeUntil && i.snoozeUntil > now));
  // Ticks only exist on the evening message, so re-render the evening shape so the
  // remaining items keep their numbered grid.
  const nudge = buildDailyNudge(live, now, "evening");
  const text = nudge?.text ?? "Well done. You cleared everything due today. 🔥";
  await editMessageText(message.chat.id, message.message_id, text, nudge?.keyboard).catch(() => {});
}

export async function POST(req: NextRequest) {
  // Constant-time check of the Telegram webhook secret (HMAC both sides, then a
  // constant-time compare) so the secret can't leak through response timing.
  const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !(await passwordMatches(provided, expected))) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const update = await req.json().catch(() => null);

  // PRD-10: the chat is the identity. Resolve-or-create the user behind it (a
  // message and a callback carry the chat id in different places), then scope
  // every read and write to that user. Open signup for friends-and-family
  // testing; abuse hardening (rate limits, allowlist) is PRD-16.
  const incomingChatId = update?.callback_query?.message?.chat?.id ?? update?.message?.chat?.id;
  if (!incomingChatId) return ok();
  // M5: harvest the first name Telegram already gives us, so the classifier can
  // personalize without ever asking for it.
  const incomingName = extractName(
    update?.callback_query?.from ?? update?.message?.from,
    update?.message?.chat
  );
  const user = await resolveUser(incomingChatId, { name: incomingName });

  // Inline button taps from the daily nudge.
  const cb = update?.callback_query;
  if (cb) {
    // Snooze presets from the calm nudge keyboard: snz:<id>:<preset>.
    const snz = String(cb.data ?? "").match(/^snz:(\d+):(\w+)$/);
    if (snz && isSnoozePreset(snz[2])) {
      const id = Number(snz[1]);
      await prisma.item
        .updateMany({
          where: { id, userId: user.id },
          data: {
            snoozeUntil: snoozeUntil(snz[2], new Date()),
            lastNudgedAt: null,
            deferCount: { increment: 1 },
          },
        })
        .catch(() => {});
      await logEvent(id, "snoozed");
      await answerCallback(cb.id, `Snoozed to ${snoozeLabel(snz[2])}.`);
      return ok();
    }

    // M8: a tick on a timed reminder. Distinct from the digest's `done:` so it
    // confirms the single ping in place instead of re-rendering the daily digest.
    const td = String(cb.data ?? "").match(/^tdone:(\d+)$/);
    if (td) {
      const id = Number(td[1]);
      await completeItem(id, user.id).catch(() => {});
      await answerCallback(cb.id, "Done. 🔥");
      if (cb.message?.message_id && cb.message.chat?.id != null) {
        await editMessageText(cb.message.chat.id, cb.message.message_id, "✓ Done. 🔥").catch(
          () => {}
        );
      }
      return ok();
    }

    const m: RegExpMatchArray | null = String(cb.data ?? "").match(/^(done|today|snooze):(\d+)$/);
    if (m) {
      const id = Number(m[2]);
      if (m[1] === "done") {
        await completeItem(id, user.id).catch(() => {});
        await answerCallback(cb.id, "Done. 🔥");
        await rerenderNudge(user.id, cb.message);
      } else if (m[1] === "today") {
        // Record the promise. Deliberately not snoozed: the evening check is
        // supposed to find it still open and call out the broken promise.
        await prisma.item
          .updateMany({ where: { id, userId: user.id }, data: { promisedAt: new Date() } })
          .catch(() => {});
        await logEvent(id, "promised");
        await answerCallback(cb.id, "On it today. I'll check tonight.");
      } else {
        const until = new Date(Date.now() + 86400000);
        await prisma.item
          .updateMany({
            where: { id, userId: user.id },
            data: { snoozeUntil: until, lastNudgedAt: null, deferCount: { increment: 1 } },
          })
          .catch(() => {});
        await logEvent(id, "snoozed");
        await answerCallback(cb.id, "Snoozed a day.");
      }
    } else {
      await answerCallback(cb.id);
    }
    return ok();
  }

  const msg = update?.message;
  const chatId = msg?.chat?.id;
  if (!chatId) return ok();

  // Cost guard (PRD-16): every message can trigger a paid Claude/Whisper call and
  // signup is open, so non-owner chats get two limits — a per-window message rate
  // limit and a hard monthly spend cap (MONTHLY_BUDGET_USD). The owner (Jules) is
  // exempt from both so testing isn't throttled. Button taps (callbacks above) are
  // cheap and not counted.
  if (!(await isOwnerUser(user.id, chatId))) {
    if (await botRateLimited(chatId)) {
      await sendMessage(chatId, "Easy there — too many messages at once. Give it a few minutes.");
      return ok();
    }
    await recordBotMessage(chatId);
    if (await overMonthlyBudget(user.id)) {
      await sendMessage(
        chatId,
        "You've used up this month's free Ember usage. It resets at the start of next month — your board still works in the meantime."
      );
      return ok();
    }
  }

  let text: string = (msg?.text ?? "").trim();

  // Voice note: transcribe it, then treat the transcript like any typed message.
  // Echo back what we heard so a bad transcription is visible before it acts.
  if (!text && msg?.voice?.file_id) {
    try {
      text = await transcribeVoice(msg.voice.file_id, {
        userId: user.id,
        durationSeconds: typeof msg.voice.duration === "number" ? msg.voice.duration : 0,
      });
    } catch {
      await sendMessage(chatId, "Couldn't make out that voice note. Try again or type it.");
      return ok();
    }
    if (text) await sendMessage(chatId, `🎙️ Heard: "${text}"`);
  }

  if (!text) return ok();

  const lower = text.toLowerCase();

  try {
    if (lower === "/start" || lower === "start") {
      // A fresh chat gets the warm, one-ask welcome; everyone else a short pointer.
      // Both carry a one-tap board button so the web dashboard is reachable straight
      // from the first message (the get-started page on the landing relies on it).
      await sendMessage(
        chatId,
        isOnboarding(user) ? welcomeMessage(user.name) : returningMessage(),
        await boardLinkKeyboard(user.id)
      );
      return ok();
    }

    if (lower === "/help" || lower === "help") {
      await sendMessage(chatId, helpMessage());
      return ok();
    }

    // Mint a one-time login link for the web board (PRD-11). The link carries a
    // short-lived signed token bound to this user; opening it sets their session.
    if (lower === "/board" || lower === "board" || lower === "/login" || lower === "login") {
      const kb = await boardLinkKeyboard(user.id);
      if (!kb) {
        await sendMessage(chatId, "Can't mint a board link: APP_SECRET or APP_URL isn't set.");
        return ok();
      }
      await sendMessage(chatId, "Here's your board. The button works once and expires in 10 minutes.", kb);
      return ok();
    }

    // Mint a referee link to forward. The URL carries a signed token, so it's safe
    // to hand to the referee.
    const reflink = lower.match(/^\/?reflink\s+(\w+)/);
    if (reflink) {
      const label = reflink[1];
      const labels = await refereeLabels(user.id);
      if (!labels.includes(label)) {
        await sendMessage(
          chatId,
          `No referee called "${label}". You have: ${labels.join(", ") || "none set up"}.`
        );
        return ok();
      }
      const secret = process.env.APP_SECRET;
      const base = process.env.APP_URL;
      if (!secret || !base) {
        await sendMessage(chatId, "Can't mint a link: APP_SECRET or APP_URL isn't set.");
        return ok();
      }
      const token = await createRefereeToken(label, secret);
      await sendMessage(
        chatId,
        `Referee link for your ${label}. Forward it to them:\n${base}/referee/${token}`
      );
      return ok();
    }

    if (lower === "list" || lower === "/list") {
      const open = await prisma.item.findMany({
        where: { status: "open", userId: user.id },
        orderBy: { id: "asc" },
      });
      if (!open.length) {
        await sendMessage(chatId, "Nothing open. Clean slate.");
        return ok();
      }
      const lines = open.map(
        (i) =>
          `#${i.id} ${i.title}` +
          (i.deadline ? ` (by ${i.deadline.toISOString().slice(0, 10)})` : "") +
          (i.referee ? ` [${i.referee}]` : "")
      );
      await sendMessage(chatId, lines.join("\n"));
      return ok();
    }

    const done = lower.match(/^\/?done\s+(\d+)/);
    if (done) {
      const id = Number(done[1]);
      await completeItem(id, user.id).catch(() => {});
      await sendMessage(chatId, `Done: #${id}.`);
      return ok();
    }

    const retire = lower.match(/^\/?retire\s+(\d+)/);
    if (retire) {
      const id = Number(retire[1]);
      await prisma.item
        .updateMany({
          where: { id, userId: user.id },
          data: { status: "retired", doneAt: new Date() },
        })
        .catch(() => {});
      await sendMessage(chatId, `Retired #${id}. It won't resurface.`);
      return ok();
    }

    const snooze = lower.match(/^\/?snooze\s+(\d+)\s+(\d+)/);
    if (snooze) {
      const id = Number(snooze[1]);
      const days = Number(snooze[2]);
      const until = new Date(Date.now() + days * 86400000);
      await prisma.item
        .updateMany({
          where: { id, userId: user.id },
          data: { snoozeUntil: until, lastNudgedAt: null, deferCount: { increment: 1 } },
        })
        .catch(() => {});
      await logEvent(id, "snoozed");
      await sendMessage(chatId, `Snoozed #${id} for ${days} day(s).`);
      return ok();
    }

    const due = lower.match(/^\/?due\s+(\d+)\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{2}:\d{2}))?/);
    if (due) {
      const id = Number(due[1]);
      const date = new Date(due[2] + "T09:00:00+08:00");
      const time = due[3] || null; // optional HH:MM → a precise timed ping (M8)
      const cur = await prisma.item.findFirst({ where: { id, userId: user.id } });
      const pushedLater = !!cur?.deadline && date.getTime() > cur.deadline.getTime();
      await prisma.item
        .updateMany({
          where: { id, userId: user.id },
          data: {
            deadline: date,
            type: deriveType(date, cur?.cadence ?? null),
            snoozeUntil: null,
            lastNudgedAt: null,
            // A clock time arms the timed ping; clear the idempotency stamp so the
            // new instant can fire. No time given leaves any existing dueAt alone.
            ...(time ? { dueAt: toDueAt(due[2], time), dueNudgedAt: null } : {}),
            ...(pushedLater ? { deferCount: { increment: 1 } } : {}),
          },
        })
        .catch(() => {});
      if (pushedLater) await logEvent(id, "snoozed");
      await sendMessage(chatId, `Deadline set on #${id}: ${due[2]}${time ? ` ${time}` : ""}.`);
      return ok();
    }

    // Freeform fallback: let Claude decide whether this creates a new item or
    // edits an existing one, and which. Exact commands above are the fast paths.
    const open = await prisma.item.findMany({
      where: { status: "open", userId: user.id },
      orderBy: { id: "asc" },
    });
    const lite: OpenItemLite[] = open.map((i) => ({
      id: i.id,
      title: i.title,
      type: i.type,
      category: i.category,
      referee: i.referee,
      deadline: i.deadline ? i.deadline.toISOString().slice(0, 10) : null,
    }));
    const openIds = new Set(open.map((i) => i.id));

    const intent = await interpret(text, nowLabelHKT(new Date()), lite, {
      name: user.name ?? undefined,
      refereeLabels: await refereeLabels(user.id),
      userId: user.id,
    });
    const f = intent.fields;

    // Mutations need a real, currently-open target. complete/snooze/retire can
    // carry several ids ("both are done"); update stays single-target. We keep only
    // ids that are actually open, so a hallucinated id is dropped rather than acted
    // on; if none survive we ask rather than touch the wrong thing.
    const multiTarget =
      intent.action === "complete" ||
      intent.action === "snooze" ||
      intent.action === "retire";
    const targetIds = intent.itemIds.filter((id) => openIds.has(id));
    if (multiTarget && !targetIds.length) {
      await sendMessage(chatId, intent.reply || "Which one? Send `list` to see the ids.");
      return ok();
    }
    if (intent.action === "update" && (!intent.itemId || !openIds.has(intent.itemId))) {
      await sendMessage(chatId, intent.reply || "Which one? Send `list` to see the ids.");
      return ok();
    }

    if (intent.action === "query" || intent.action === "clarify") {
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    if (intent.action === "complete") {
      // Sequential so each commitment's cadence math reads a consistent state.
      for (const id of targetIds) await completeItem(id, user.id).catch(() => {});
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    if (intent.action === "retire") {
      await prisma.item
        .updateMany({
          where: { id: { in: targetIds }, userId: user.id },
          data: { status: "retired", doneAt: new Date() },
        })
        .catch(() => {});
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    if (intent.action === "snooze") {
      const days = intent.snoozeDays ?? 1;
      const until = new Date(Date.now() + days * 86400000);
      await prisma.item
        .updateMany({
          where: { id: { in: targetIds }, userId: user.id },
          data: { snoozeUntil: until, lastNudgedAt: null, deferCount: { increment: 1 } },
        })
        .catch(() => {});
      await Promise.all(targetIds.map((id) => logEvent(id, "snoozed")));
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    if (intent.action === "update") {
      const cur = await prisma.item.findFirst({ where: { id: intent.itemId!, userId: user.id } });
      const data: Record<string, unknown> = {};
      if (f.title !== undefined) data.title = clampTitle(f.title);
      if (f.category !== undefined) data.category = normalizeCategory(f.category);
      if (f.important !== undefined) data.important = f.important;
      // Deadline and cadence drive the derived type; recompute it from the values
      // that will be in place after this edit.
      const newDeadline = "deadline" in f ? toDeadline(f.deadline) : cur?.deadline ?? null;
      const newCadence = "cadence" in f ? f.cadence ?? null : cur?.cadence ?? null;
      if ("deadline" in f) data.deadline = newDeadline;
      if ("referee" in f) data.referee = f.referee;
      if ("cadence" in f) data.cadence = newCadence;
      data.type = deriveType(newDeadline, newCadence);
      // A concrete date re-engages the item: drop any active snooze so the new
      // deadline takes effect rather than staying pinned by an old defer.
      if ("deadline" in f && newDeadline) {
        data.snoozeUntil = null;
        data.lastNudgedAt = null;
      }
      // M8: a clock time sets/clears the precise dueAt and re-arms the ping. When
      // there's no day-anchor yet, default it to the ping's day so the item is a
      // dated task rather than parking.
      if ("dueTime" in f) {
        if (f.dueTime) {
          const day = newDeadline ? isoHKT(newDeadline) : isoHKT(new Date());
          data.dueAt = toDueAt(day, f.dueTime);
          data.dueNudgedAt = null;
          if (!newDeadline) {
            const dl = toDeadline(day);
            data.deadline = dl;
            data.type = deriveType(dl, newCadence);
          }
        } else {
          data.dueAt = null;
          data.dueNudgedAt = null;
        }
      }
      // Shoving the deadline out counts as a deferral.
      const pushedLater =
        "deadline" in f &&
        !!cur?.deadline &&
        !!newDeadline &&
        newDeadline.getTime() > cur.deadline.getTime();
      if (pushedLater) data.deferCount = { increment: 1 };
      await prisma.item
        .updateMany({ where: { id: intent.itemId!, userId: user.id }, data })
        .catch(() => {});
      if (pushedLater) await logEvent(intent.itemId!, "snoozed");
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    // Default: create it. Type falls out of deadline + cadence, never the model's
    // own guess, so the date is the single lever.
    // M8: a clock time arms a precise ping; it implies a dated task, so default the
    // day-anchor deadline to the ping's day when no date was given.
    const dueAt = f.dueTime ? toDueAt(f.deadline, f.dueTime) : null;
    const newDeadline = toDeadline(f.deadline) ?? (dueAt ? toDeadline(isoHKT(dueAt)) : null);
    const newCadence = f.cadence ?? null;
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: clampTitle(f.title ?? text) || text.slice(0, 80),
        type: deriveType(newDeadline, newCadence),
        category: normalizeCategory(f.category),
        important: f.important ?? true,
        deadline: newDeadline,
        dueAt,
        referee: f.referee ?? null,
        cadence: newCadence,
        snoozeUntil: intent.snoozeDays
          ? new Date(Date.now() + intent.snoozeDays * 86400000)
          : null,
      },
    });
    await sendMessage(
      chatId,
      `${intent.reply}\n#${item.id} · ${item.type}` +
        (item.category ? ` · ${item.category}` : "") +
        (f.deadline ? ` · by ${f.deadline}` : "") +
        (f.dueTime ? ` · ${f.dueTime}` : "") +
        (item.referee ? ` · ${item.referee}` : "")
    );
    // M5: the first captured item is the activation event. Send the one-time
    // orientation and close out onboarding. (Referee step parked; it will sit here.)
    if (isOnboarding(user)) {
      await prisma.user
        .update({ where: { id: user.id }, data: { onboardingStep: "done" } })
        .catch(() => {});
      await sendMessage(chatId, orientationMessage());
    }
    return ok();
  } catch {
    await sendMessage(chatId, "Hmm, that one broke. Try rephrasing.");
    return ok();
  }
}
