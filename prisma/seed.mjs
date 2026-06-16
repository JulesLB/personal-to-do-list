import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const day = 86400000;

const items = [
  { title: "Book the dentist", type: "task", important: true, urgent: true, deadline: new Date("2026-06-21T09:00:00"), referee: "wife" },
  { title: "Register the marriage in the French registry", type: "task", important: true, urgent: false, deadline: new Date("2026-06-30T09:00:00"), referee: "wife" },
  { title: "Build the company", type: "commitment", important: true, urgent: false, cadence: "monthly", referee: "sister" },
  { title: "Upskill in AI: n8n + agents", type: "commitment", important: true, urgent: false, cadence: "weekly", referee: "colleague" },
  { title: "Reply to the building admin email", type: "task", important: false, urgent: true, referee: null },
  { title: "Watch: the n8n automation video", type: "parking", important: false, urgent: false, snoozeUntil: new Date(Date.now() + 14 * day) },
  { title: "Pick the next restaurant with my wife", type: "parking", important: false, urgent: false },
];

await prisma.item.deleteMany();
for (const it of items) await prisma.item.create({ data: it });
console.log(`Seeded ${items.length} items.`);
await prisma.$disconnect();
