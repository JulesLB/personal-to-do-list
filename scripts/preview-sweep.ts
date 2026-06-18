import { PrismaClient } from "@prisma/client";
import { runSweep, type Sender, type Slot } from "../src/lib/sweep";
import type { InlineKeyboard } from "../src/lib/telegram";

// Dry-run the full sweep against the local DB: same path the cron takes
// (ranking, accountability-memory writes, Event log), but the Telegram send is
// captured and printed instead of hitting the network. Run it twice to watch
// ignoreCount climb as the top item gets re-nudged while still open.
//
//   npx tsx scripts/preview-sweep.ts            # morning
//   npx tsx scripts/preview-sweep.ts evening    # evening

const prisma = new PrismaClient();

async function main() {
  const slot: Slot = process.argv[2] === "evening" ? "evening" : "morning";

  // The sweep needs a nudge target. Use whatever's configured; otherwise stand
  // up a temporary owner and tear it down after so a real one isn't clobbered.
  const existing = await prisma.setting.findUnique({ where: { key: "ownerChatId" } });
  const usingTemp = !existing && !process.env.OWNER_CHAT_ID;
  if (usingTemp) {
    await prisma.setting.create({ data: { key: "ownerChatId", value: "preview" } });
  }

  const sent: { chatId: string | number; text: string; keyboard?: InlineKeyboard }[] = [];
  const send: Sender = async (chatId, text, keyboard) => {
    sent.push({ chatId, text, keyboard });
  };

  const eventsBefore = await prisma.event.count();
  const result = await runSweep(slot, send);
  const eventsAfter = await prisma.event.count();

  console.log(`=== ${slot} sweep (dry run) ===\n`);

  const msg = sent[0];
  if (!msg) {
    console.log("(silent — nothing pressing)");
  } else {
    console.log(msg.text);
    console.log("\nButtons:");
    console.log(JSON.stringify(msg.keyboard?.inline_keyboard ?? [], null, 2));
  }

  if (result.topId) {
    const top = await prisma.item.findUnique({ where: { id: result.topId } });
    console.log(`\nTop item #${top?.id} "${top?.title}"`);
    console.log(`  nudgeCount   = ${top?.nudgeCount}`);
    console.log(`  ignoreCount  = ${top?.ignoreCount}`);
    console.log(`  lastNudgedAt = ${top?.lastNudgedAt?.toISOString() ?? "null"}`);
  }

  console.log(`\nSent to chat: ${result.chatId ?? "(none — set OWNER_CHAT_ID or message the bot)"}`);
  console.log(`Events written this run: ${eventsAfter - eventsBefore}`);

  if (usingTemp) {
    await prisma.setting.delete({ where: { key: "ownerChatId" } });
  }
  await prisma.$disconnect();
}

main();
