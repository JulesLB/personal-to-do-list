// Multi-user isolation check (PRD-10/11). Runs against a real throwaway SQLite DB
// (set up by check-isolation.mjs) and exercises the actual code that enforces
// tenancy — resolveUser — plus the scoped query/mutation shapes the board and
// webhook rely on. Asserts that two users never see or touch each other's data.
//
//   npm run check:isolation

import { prisma } from "../src/lib/db";
import { resolveUser, ownerUser, refereeLabels } from "../src/lib/user";

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  // --- resolveUser: placeholder reconcile (the migration's "pending-owner" path) ---
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { telegramChatId: "pending-owner", name: "Jules" } });
  const adopted = await resolveUser("chat-real");
  check("placeholder owner is adopted by the first real chat", adopted.telegramChatId === "chat-real");
  check("no duplicate user created during adoption", (await prisma.user.count()) === 1);

  // --- resolveUser: one user per chat, stable across calls ---
  await prisma.user.deleteMany();
  const a1 = await resolveUser("chat-A");
  const a2 = await resolveUser("chat-A");
  const b1 = await resolveUser("chat-B");
  check("same chat resolves to the same user", a1.id === a2.id);
  check("different chats resolve to different users", a1.id !== b1.id);
  check("exactly two users exist", (await prisma.user.count()) === 2);

  // --- item isolation ---
  await prisma.item.create({ data: { userId: a1.id, title: "A's task", type: "task" } });
  const bItem = await prisma.item.create({ data: { userId: b1.id, title: "B's task", type: "task" } });

  const aItems = await prisma.item.findMany({ where: { userId: a1.id } });
  const bItems = await prisma.item.findMany({ where: { userId: b1.id } });
  check("user A sees only their own item", aItems.length === 1 && aItems[0].title === "A's task");
  check("user B sees only their own item", bItems.length === 1 && bItems[0].title === "B's task");

  // --- cross-user mutation guard (the updateMany/deleteMany-by-{id,userId} pattern) ---
  const upd = await prisma.item.updateMany({
    where: { id: bItem.id, userId: a1.id },
    data: { status: "done" },
  });
  check("A cannot complete B's item by id (scoped update is a no-op)", upd.count === 0);
  check("B's item is still open after A's attempt", (await prisma.item.findUnique({ where: { id: bItem.id } }))?.status === "open");

  const del = await prisma.item.deleteMany({ where: { id: bItem.id, userId: a1.id } });
  check("A cannot delete B's item by id (scoped delete is a no-op)", del.count === 0);
  check("B's item still exists after A's delete attempt", !!(await prisma.item.findUnique({ where: { id: bItem.id } })));

  // --- ownerUser is the lowest-id user (the board's owner fast path) ---
  check("ownerUser resolves to the first user", (await ownerUser())?.id === a1.id);

  // --- referee isolation ---
  await prisma.referee.create({ data: { userId: b1.id, label: "wife" } });
  const aLabels = await refereeLabels(a1.id);
  const bLabels = await refereeLabels(b1.id);
  check("A has no referees", aLabels.length === 0);
  check("B's referee does not leak to A", !aLabels.includes("wife") && bLabels.includes("wife"));

  await prisma.user.deleteMany();
  await prisma.$disconnect();

  console.log(
    failures === 0
      ? "\nAll isolation checks passed."
      : `\n${failures} isolation check(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main();
