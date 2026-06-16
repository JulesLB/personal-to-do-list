import { prisma } from "./db";
import { sendMessage } from "./telegram";
import { waLink } from "./waLink";

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysSince = (d: Date) => (Date.now() - d.getTime()) / DAY;

type Nudge = { priority: number; itemId: number; text: string };

export async function runSweep(): Promise<{ sent: number; chatId: string | null }> {
  const setting = await prisma.setting.findUnique({ where: { key: "ownerChatId" } });
  const chatId = setting?.value ?? process.env.OWNER_CHAT_ID ?? null;
  if (!chatId) return { sent: 0, chatId: null };

  const items = await prisma.item.findMany({ where: { status: "open" } });
  const now = new Date();
  const nudges: Nudge[] = [];

  for (const it of items) {
    if (it.snoozeUntil && it.snoozeUntil > now) continue;
    if (it.lastNudgedAt && daysSince(it.lastNudgedAt) < 1) continue;

    // 1. Overdue task -> escalate to the referee
    if (it.type === "task" && it.deadline && it.deadline < now) {
      const draft = `Accountability check: I said I'd "${it.title}" by ${isoDate(it.deadline)} and I haven't. Calling it out so you hold me to it.`;
      const link = waLink(it.referee, draft);
      const tell = it.referee ? ` Time to tell your ${it.referee}.` : "";
      nudges.push({
        priority: 1,
        itemId: it.id,
        text: `Overdue: "${it.title}" (#${it.id}).${tell}${link ? `\nSend it: ${link}` : ""}\nReply "done ${it.id}" when handled.`,
      });
      continue;
    }

    // 2. Task due within 48h -> remind
    if (it.type === "task" && it.deadline) {
      const hrs = (it.deadline.getTime() - now.getTime()) / (60 * 60 * 1000);
      if (hrs > 0 && hrs <= 48) {
        nudges.push({
          priority: 2,
          itemId: it.id,
          text: `Due soon: "${it.title}" (#${it.id}) by ${isoDate(it.deadline)}.\nReply "done ${it.id}" when handled.`,
        });
        continue;
      }
    }

    // 3. Commitment due for a progress update (~monthly)
    if (it.type === "commitment") {
      const ref = it.lastNudgedAt ?? it.createdAt;
      if (daysSince(ref) >= 30) {
        const draft = `Monthly update on "${it.title}": here is where I am - `;
        const link = waLink(it.referee, draft);
        const tell = it.referee ? ` Show your ${it.referee} real progress.` : "";
        nudges.push({
          priority: 3,
          itemId: it.id,
          text: `Progress time: "${it.title}" (#${it.id}).${tell}${link ? `\nDraft: ${link}` : ""}`,
        });
        continue;
      }
    }

    // 4. Death zone: important, not urgent, no deadline, sitting 3+ days
    if (it.important && !it.urgent && !it.deadline && it.type !== "parking") {
      if (daysSince(it.createdAt) >= 3) {
        nudges.push({
          priority: 4,
          itemId: it.id,
          text: `Still sitting: "${it.title}" (#${it.id}). Important but not urgent is where things die. Give it a deadline: reply "due ${it.id} YYYY-MM-DD".`,
        });
        continue;
      }
    }

    // 5. Parking lot: resurface once the snooze has elapsed
    if (it.type === "parking" && it.snoozeUntil && it.snoozeUntil <= now) {
      nudges.push({
        priority: 5,
        itemId: it.id,
        text: `Resurfacing: "${it.title}" (#${it.id}). Still want it? Reply "done ${it.id}" to clear or "snooze ${it.id} 14" to push it.`,
      });
      continue;
    }
  }

  nudges.sort((a, b) => a.priority - b.priority);
  const top = nudges.slice(0, 3);

  for (const n of top) {
    await sendMessage(chatId, n.text);
    await prisma.item.update({ where: { id: n.itemId }, data: { lastNudgedAt: new Date() } });
  }

  return { sent: top.length, chatId };
}
