import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const day = 86400000;
const at9 = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(9, 0, 0, 0);
  return d;
};

const ago = (days) => new Date(Date.now() - days * day);

const items = [
  { title: "Book the dentist", type: "task", category: "personal", important: true, urgent: true, deadline: at9(-4), referee: "wife" },
  { title: "Submit the expense report", type: "task", category: "finance", important: true, urgent: true, deadline: at9(2), referee: "colleague" },
  { title: "Send the company update to my sister", type: "task", category: "business", important: true, urgent: false, deadline: at9(3), referee: "sister" },
  { title: "Prep the client deck section", type: "task", category: "work", important: true, urgent: false, deadline: at9(4), referee: "colleague" },
  { title: "Register the marriage in the French registry", type: "task", category: "personal", important: true, urgent: false, deadline: at9(10), referee: "wife" },
  { title: "Renew the gym membership", type: "task", category: "fitness", important: false, urgent: false, deadline: at9(7), referee: null },
  { title: "Reply to the building admin email", type: "task", category: "personal", important: false, urgent: true, referee: null },
  { title: "Build the company", type: "commitment", category: "business", important: true, urgent: false, cadence: "monthly", referee: "sister", lastDoneAt: ago(70) },
  { title: "Upskill in AI: n8n + agents", type: "commitment", category: "learning", important: true, urgent: false, cadence: "weekly", referee: "colleague", lastDoneAt: ago(9) },
  { title: "Watch: the n8n automation video", type: "parking", category: "learning", important: false, urgent: false, snoozeUntil: new Date(Date.now() + 14 * day) },
  { title: "Pick the next restaurant with my wife", type: "parking", category: "personal", important: false, urgent: false },
];

await prisma.item.deleteMany();
for (const it of items) await prisma.item.create({ data: it });
console.log(`Seeded ${items.length} items.`);
await prisma.$disconnect();
