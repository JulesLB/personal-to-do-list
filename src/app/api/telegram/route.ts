import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage } from "@/lib/telegram";
import { classify } from "@/lib/classify";

export const dynamic = "force-dynamic";

const todayISO = () => new Date().toISOString().slice(0, 10);
const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const chatId = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId || !text) return ok();

  // Single user: remember who is talking so the cron knows where to nudge.
  await prisma.setting.upsert({
    where: { key: "ownerChatId" },
    update: { value: String(chatId) },
    create: { key: "ownerChatId", value: String(chatId) },
  });

  const lower = text.toLowerCase();

  try {
    if (lower === "/start") {
      await sendMessage(
        chatId,
        'Hermes here. Text me anything and I log it. Commands: "list", "done <id>", "snooze <id> <days>", "due <id> YYYY-MM-DD".'
      );
      return ok();
    }

    if (lower === "list" || lower === "/list") {
      const open = await prisma.item.findMany({ where: { status: "open" }, orderBy: { id: "asc" } });
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
      await prisma.item
        .update({ where: { id }, data: { status: "done", doneAt: new Date() } })
        .catch(() => {});
      await sendMessage(chatId, `Done: #${id}.`);
      return ok();
    }

    const snooze = lower.match(/^\/?snooze\s+(\d+)\s+(\d+)/);
    if (snooze) {
      const id = Number(snooze[1]);
      const days = Number(snooze[2]);
      const until = new Date(Date.now() + days * 86400000);
      await prisma.item
        .update({ where: { id }, data: { snoozeUntil: until, lastNudgedAt: null } })
        .catch(() => {});
      await sendMessage(chatId, `Snoozed #${id} for ${days} day(s).`);
      return ok();
    }

    const due = lower.match(/^\/?due\s+(\d+)\s+(\d{4}-\d{2}-\d{2})/);
    if (due) {
      const id = Number(due[1]);
      const date = new Date(due[2] + "T09:00:00");
      await prisma.item
        .update({ where: { id }, data: { deadline: date, urgent: true } })
        .catch(() => {});
      await sendMessage(chatId, `Deadline set on #${id}: ${due[2]}.`);
      return ok();
    }

    // Default: capture it.
    const c = await classify(text, todayISO());
    const item = await prisma.item.create({
      data: {
        title: c.title,
        type: c.type,
        important: c.important,
        urgent: c.urgent,
        deadline: c.deadline ? new Date(c.deadline + "T09:00:00") : null,
        referee: c.referee,
        cadence: c.cadence,
        snoozeUntil: c.snoozeDays ? new Date(Date.now() + c.snoozeDays * 86400000) : null,
      },
    });
    await sendMessage(
      chatId,
      `${c.reply}\n#${item.id} · ${item.type}` +
        (c.deadline ? ` · by ${c.deadline}` : "") +
        (item.referee ? ` · ${item.referee}` : "")
    );
    return ok();
  } catch {
    await sendMessage(chatId, "Hmm, that one broke. Try rephrasing.");
    return ok();
  }
}
