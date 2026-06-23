"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { deriveType, isoHKT } from "@/lib/rank";
import { forceAnalysis } from "@/lib/reviewAnalysis";
import { currentUser } from "@/lib/session";
import { clampTitle, normalizeCategory } from "@/lib/validate";

// Both control surfaces read the same items, so every mutation refreshes both the
// board and the Review page.
function revalidateBoards() {
  revalidatePath("/");
  revalidatePath("/review");
}

export async function markDone(id: number) {
  // PRD-11: every board mutation scopes to the logged-in user. Scoping by userId
  // stops a guessed id from touching another user's item.
  const me = await currentUser();
  if (!me) return;
  const item = await prisma.item.findFirst({ where: { id, userId: me.id } });
  if (!item) return;
  // A commitment is honored per cycle, not closed forever: reset its clock and
  // keep it open. Everything else closes.
  if (item.type === "commitment") {
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
  await prisma.event.create({ data: { itemId: id, kind: "done" } });
  revalidateBoards();
}

export async function retire(id: number) {
  const me = await currentUser();
  if (!me) return;
  await prisma.item.updateMany({
    where: { id, userId: me.id },
    data: { status: "retired", doneAt: new Date() },
  });
  revalidateBoards();
}

// Edit the fields you control: title, category, referee, deadline, and whether it
// repeats (cadence). Type is derived from deadline+cadence, never set by hand, and
// "important" is brain-owned so the panel leaves it alone. Deadlines are stored at
// 09:00 HKT. Empty selects/date clear the field; a blank title is ignored so a
// stray submit can't wipe the item. Shoving the deadline to a later date counts as
// a deferral, same as a snooze.
export async function updateItem(id: number, formData: FormData) {
  const title = clampTitle(String(formData.get("title") ?? ""));
  if (!title) return;
  const me = await currentUser();
  if (!me) return;
  const cur = await prisma.item.findFirst({ where: { id, userId: me.id } });
  if (!cur) return;
  const deadlineStr = String(formData.get("deadline") ?? "");
  // M8: an optional clock time pins a precise reminder. A time with no date implies
  // today, so it anchors the deadline to today too (a timed ping is a dated task).
  const dueTimeStr = String(formData.get("dueTime") ?? "");
  const dayStr = deadlineStr || (dueTimeStr ? isoHKT(new Date()) : "");
  const deadline = dayStr ? new Date(dayStr + "T09:00:00+08:00") : null;
  const dueAt = dueTimeStr && dayStr ? new Date(`${dayStr}T${dueTimeStr}:00+08:00`) : null;
  const dueAtChanged = (cur.dueAt?.getTime() ?? null) !== (dueAt?.getTime() ?? null);
  const cadence = String(formData.get("cadence") || "") || null;
  const pushedLater =
    !!cur.deadline && !!deadline && deadline.getTime() > cur.deadline.getTime();
  await prisma.item.update({
    where: { id },
    data: {
      title,
      type: deriveType(deadline, cadence),
      category: normalizeCategory(String(formData.get("category") || "")),
      referee: String(formData.get("referee") || "") || null,
      cadence,
      deadline,
      dueAt,
      // Changing the precise time re-arms the ping (clears the once-only stamp).
      ...(dueAtChanged ? { dueNudgedAt: null } : {}),
      // Setting a concrete date re-engages the item: release any active snooze and
      // the nudge clock so a closer deadline takes effect instead of staying pinned
      // by an old "push it to next week".
      ...(deadline ? { snoozeUntil: null, lastNudgedAt: null } : {}),
      ...(pushedLater ? { deferCount: { increment: 1 } } : {}),
    },
  });
  if (pushedLater) await prisma.event.create({ data: { itemId: id, kind: "snoozed" } });
  revalidateBoards();
}

// Add an item straight from the board. Same shape as the Telegram create path:
// type is derived from deadline+cadence, important defaults to true (the death
// zone rule — anything you bother typing in is assumed to matter until proven
// otherwise), deadlines stored at 09:00 HKT. A blank title is ignored.
export async function createItem(formData: FormData) {
  const title = clampTitle(String(formData.get("title") ?? ""));
  if (!title) return;
  const me = await currentUser();
  if (!me) return;
  const deadlineStr = String(formData.get("deadline") ?? "");
  // M8: a clock time arms a precise ping; with no date it implies today, which also
  // anchors the deadline so the item is a dated task rather than parking.
  const dueTimeStr = String(formData.get("dueTime") ?? "");
  const dayStr = deadlineStr || (dueTimeStr ? isoHKT(new Date()) : "");
  const deadline = dayStr ? new Date(dayStr + "T09:00:00+08:00") : null;
  const dueAt = dueTimeStr && dayStr ? new Date(`${dayStr}T${dueTimeStr}:00+08:00`) : null;
  const cadence = String(formData.get("cadence") || "") || null;
  await prisma.item.create({
    data: {
      userId: me.id,
      title,
      type: deriveType(deadline, cadence),
      category: normalizeCategory(String(formData.get("category") || "")),
      important: true,
      deadline,
      dueAt,
      referee: String(formData.get("referee") || "") || null,
      cadence,
    },
  });
  revalidateBoards();
}

export async function remove(id: number) {
  const me = await currentUser();
  if (!me) return;
  await prisma.item.deleteMany({ where: { id, userId: me.id } });
  revalidateBoards();
}

// Regenerate the AI coach read on demand (the Review page's Refresh button). One
// Haiku call, then a /review revalidate so the fresh read renders.
export async function refreshAnalysis() {
  const now = new Date();
  const me = await currentUser();
  if (!me) return;
  const [items, events] = await prisma.$transaction([
    prisma.item.findMany({ where: { userId: me.id } }),
    prisma.event.findMany({
      where: { item: { userId: me.id } },
      select: { itemId: true, kind: true, createdAt: true },
    }),
  ]);
  await forceAnalysis(me.id, items, events, now);
  revalidatePath("/review");
}

