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

  // The sweep loops users. If none exist locally, stand up a temporary one and
  // tear it down after so a real one isn't clobbered.
  const existing = await prisma.user.findFirst({ orderBy: { id: "asc" } });
  let tempId: number | null = null;
  if (!existing) {
    const u = await prisma.user.create({ data: { telegramChatId: "preview", name: "Preview" } });
    tempId = u.id;
  }

  const sent: { chatId: string | number; text: string; keyboard?: InlineKeyboard }[] = [];
  const send: Sender = async (chatId, text, keyboard) => {
    sent.push({ chatId, text, keyboard });
  };

  const eventsBefore = await prisma.event.count();
  const result = await runSweep(slot, send);
  const eventsAfter = await prisma.event.count();

  console.log(`=== ${slot} sweep (dry run) ===\n`);

  if (!sent.length) {
    console.log("(silent — nothing pressing for any user)");
  } else {
    for (const msg of sent) {
      console.log(`--- to chat ${msg.chatId} ---`);
      console.log(msg.text);
      if (msg.keyboard) {
        console.log("\nButtons:");
        console.log(JSON.stringify(msg.keyboard.inline_keyboard, null, 2));
      }
      console.log("");
    }
  }

  console.log(`Users swept: ${result.users} · nudged: ${result.sent}`);
  console.log(`Events written this run: ${eventsAfter - eventsBefore}`);

  if (tempId) await prisma.user.delete({ where: { id: tempId } });
  await prisma.$disconnect();
}

main();
