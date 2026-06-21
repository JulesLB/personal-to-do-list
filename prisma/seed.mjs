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
  // The hero: important and overdue, so the hero card fills red. Its missed due
  // day (4 days ago) is what caps the streak below.
  { title: "Book the dentist", type: "task", category: "personal", important: true, deadline: at9(-4), referee: "wife", deferCount: 3 },
  // Burning (due today) — the band the fire is most fun on. Due today, not
  // overdue, so torching them is the streak-friendly path.
  { title: "Pay the credit card bill", type: "task", category: "finance", important: true, deadline: at9(0), referee: null },
  { title: "Send the company update to my sister", type: "task", category: "business", important: true, deadline: at9(0), referee: "sister" },
  { title: "Reply to the building admin email", type: "task", category: "personal", important: false, deadline: at9(0), referee: null },
  { title: "Confirm the flight change", type: "task", category: "personal", important: true, deadline: at9(0), referee: "wife" },
  { title: "Call the landlord about the lease", type: "task", category: "personal", important: true, deadline: at9(0), referee: null },
  // Heating up (due in a few days).
  { title: "Submit the expense report", type: "task", category: "finance", important: true, deadline: at9(2), referee: "colleague" },
  { title: "Prep the client deck section", type: "task", category: "work", important: true, deadline: at9(3), referee: "colleague" },
  { title: "Draft the cold outreach email", type: "task", category: "business", important: true, deadline: at9(2), referee: "sister" },
  { title: "Renew the gym membership", type: "task", category: "fitness", important: false, deadline: at9(3), referee: null },
  // Back burner (further out).
  { title: "Register the marriage in the French registry", type: "task", category: "personal", important: true, deadline: at9(10), referee: "wife" },
  { title: "Plan the Q3 learning sprint", type: "task", category: "learning", important: false, deadline: at9(12), referee: null },
  { title: "Book the dental cleaning follow-up", type: "task", category: "fitness", important: false, deadline: at9(8), referee: null },
  // Commitments (recurring) and parking (undated).
  { title: "Build the company", type: "commitment", category: "business", important: true, cadence: "monthly", referee: "sister", lastDoneAt: ago(70) },
  { title: "Upskill in AI: n8n + agents", type: "commitment", category: "learning", important: true, cadence: "weekly", referee: "colleague", lastDoneAt: ago(9) },
  { title: "Watch: the n8n automation video", type: "parking", category: "learning", important: false, createdAt: ago(20) },
  { title: "Pick the next restaurant with my wife", type: "parking", category: "personal", important: false },
];

// Reset and seed a single owner; deleting the user cascades items/referees/events.
await prisma.user.deleteMany();
const user = await prisma.user.create({
  data: {
    telegramChatId: "seed-owner",
    name: "Jules",
    referees: { create: [{ label: "wife" }, { label: "sister" }, { label: "colleague" }] },
  },
});

const created = [];
for (const it of items) created.push(await prisma.item.create({ data: { ...it, userId: user.id } }));

// Completion history so the streak chip shows in the sandbox. A "done" Event on
// each of the last 3 days = a 3-day streak (today is still open, so clearing
// something now bumps it to 4 and the loop is visible end to end).
const doneAt = (days) => {
  const d = new Date(Date.now() - days * day);
  d.setHours(20, 0, 0, 0);
  return d;
};
const anchorId = created[0].id;
for (const k of [1, 2, 3]) {
  await prisma.event.create({ data: { itemId: anchorId, kind: "done", createdAt: doneAt(k) } });
}

console.log(`Seeded ${items.length} items + 3 days of streak history.`);
await prisma.$disconnect();
