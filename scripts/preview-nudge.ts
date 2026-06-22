import { PrismaClient } from "@prisma/client";
import { buildDailyNudge, type Slot } from "../src/lib/nudge";

async function main() {
  const slot: Slot = process.argv[2] === "evening" ? "evening" : "morning";
  const prisma = new PrismaClient();
  const now = new Date();
  const items = await prisma.item.findMany({ where: { status: "open" } });
  const live = items.filter((i) => !(i.snoozeUntil && i.snoozeUntil > now));
  const nudge = buildDailyNudge(live, now, slot);

  console.log(`=== ${slot} nudge text ===\n`);
  console.log(nudge ? nudge.text : "(no nudge — stays silent)");
  console.log("\n=== Buttons ===");
  console.log(JSON.stringify(nudge?.keyboard?.inline_keyboard ?? [], null, 2));

  await prisma.$disconnect();
}

main();
