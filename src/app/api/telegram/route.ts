import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage, answerCallback, type InlineKeyboard } from "@/lib/telegram";
import { interpret, type OpenItemLite } from "@/lib/classify";
import { createRefereeToken, createLoginLinkToken } from "@/lib/auth";
import { transcribeVoice } from "@/lib/voice";
import { snoozeUntil, snoozeLabel, isSnoozePreset } from "@/lib/snooze";
import { deriveType } from "@/lib/rank";
import { resolveUser, refereeLabels } from "@/lib/user";
import {
  extractName,
  isOnboarding,
  welcomeMessage,
  returningMessage,
  orientationMessage,
  helpMessage,
} from "@/lib/onboarding";

export const dynamic = "force-dynamic";

const todayISO = () => new Date().toISOString().slice(0, 10);
const ok = () => NextResponse.json({ ok: true });

// Deadlines live at 09:00 HKT so "due today" never drifts on the UTC server.
const toDeadline = (d: string | null | undefined) =>
  d ? new Date(d + "T09:00:00+08:00") : null;

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

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
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

    const m: RegExpMatchArray | null = String(cb.data ?? "").match(/^(done|today|snooze):(\d+)$/);
    if (m) {
      const id = Number(m[2]);
      if (m[1] === "done") {
        await completeItem(id, user.id).catch(() => {});
        await answerCallback(cb.id, "Done.");
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

    const due = lower.match(/^\/?due\s+(\d+)\s+(\d{4}-\d{2}-\d{2})/);
    if (due) {
      const id = Number(due[1]);
      const date = new Date(due[2] + "T09:00:00+08:00");
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
            ...(pushedLater ? { deferCount: { increment: 1 } } : {}),
          },
        })
        .catch(() => {});
      if (pushedLater) await logEvent(id, "snoozed");
      await sendMessage(chatId, `Deadline set on #${id}: ${due[2]}.`);
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

    const intent = await interpret(text, todayISO(), lite, {
      name: user.name ?? undefined,
      refereeLabels: await refereeLabels(user.id),
      userId: user.id,
    });
    const f = intent.fields;

    // Mutations need a real, currently-open target. A missing or hallucinated
    // id means we ask rather than touch the wrong thing.
    const needsTarget =
      intent.action === "update" ||
      intent.action === "complete" ||
      intent.action === "snooze" ||
      intent.action === "retire";
    if (needsTarget && (!intent.itemId || !openIds.has(intent.itemId))) {
      await sendMessage(chatId, intent.reply || "Which one? Send `list` to see the ids.");
      return ok();
    }

    if (intent.action === "query" || intent.action === "clarify") {
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    if (intent.action === "complete") {
      await completeItem(intent.itemId!, user.id).catch(() => {});
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    if (intent.action === "retire") {
      await prisma.item
        .updateMany({
          where: { id: intent.itemId!, userId: user.id },
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
          where: { id: intent.itemId!, userId: user.id },
          data: { snoozeUntil: until, lastNudgedAt: null, deferCount: { increment: 1 } },
        })
        .catch(() => {});
      await logEvent(intent.itemId!, "snoozed");
      await sendMessage(chatId, intent.reply);
      return ok();
    }

    if (intent.action === "update") {
      const cur = await prisma.item.findFirst({ where: { id: intent.itemId!, userId: user.id } });
      const data: Record<string, unknown> = {};
      if (f.title !== undefined) data.title = f.title;
      if (f.category !== undefined) data.category = f.category;
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
    const newDeadline = toDeadline(f.deadline);
    const newCadence = f.cadence ?? null;
    const item = await prisma.item.create({
      data: {
        userId: user.id,
        title: f.title ?? text.slice(0, 80),
        type: deriveType(newDeadline, newCadence),
        category: f.category ?? null,
        important: f.important ?? true,
        deadline: newDeadline,
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
