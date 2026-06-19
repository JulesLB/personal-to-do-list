"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { snoozeUntil, isSnoozePreset } from "@/lib/snooze";
import { deriveType } from "@/lib/rank";

export async function markDone(id: number) {
  const item = await prisma.item.findUnique({ where: { id } });
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
  revalidatePath("/");
}

export async function retire(id: number) {
  await prisma.item.update({ where: { id }, data: { status: "retired", doneAt: new Date() } });
  revalidatePath("/");
}

// Edit the fields you control: title, category, referee, deadline, and whether it
// repeats (cadence). Type is derived from deadline+cadence, never set by hand, and
// "important" is brain-owned so the panel leaves it alone. Deadlines are stored at
// 09:00 HKT. Empty selects/date clear the field; a blank title is ignored so a
// stray submit can't wipe the item. Shoving the deadline to a later date counts as
// a deferral, same as a snooze.
export async function updateItem(id: number, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const cur = await prisma.item.findUnique({ where: { id } });
  if (!cur) return;
  const deadlineStr = String(formData.get("deadline") ?? "");
  const deadline = deadlineStr ? new Date(deadlineStr + "T09:00:00+08:00") : null;
  const cadence = String(formData.get("cadence") || "") || null;
  const pushedLater =
    !!cur.deadline && !!deadline && deadline.getTime() > cur.deadline.getTime();
  await prisma.item.update({
    where: { id },
    data: {
      title,
      type: deriveType(deadline, cadence),
      category: String(formData.get("category") || "") || null,
      referee: String(formData.get("referee") || "") || null,
      cadence,
      deadline,
      // Setting a concrete date re-engages the item: release any active snooze and
      // the nudge clock so a closer deadline takes effect instead of staying pinned
      // by an old "push it to next week".
      ...(deadline ? { snoozeUntil: null, lastNudgedAt: null } : {}),
      ...(pushedLater ? { deferCount: { increment: 1 } } : {}),
    },
  });
  if (pushedLater) await prisma.event.create({ data: { itemId: id, kind: "snoozed" } });
  revalidatePath("/");
}

// Add an item straight from the board. Same shape as the Telegram create path:
// type is derived from deadline+cadence, important defaults to true (the death
// zone rule — anything you bother typing in is assumed to matter until proven
// otherwise), deadlines stored at 09:00 HKT. A blank title is ignored.
export async function createItem(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const deadlineStr = String(formData.get("deadline") ?? "");
  const deadline = deadlineStr ? new Date(deadlineStr + "T09:00:00+08:00") : null;
  const cadence = String(formData.get("cadence") || "") || null;
  await prisma.item.create({
    data: {
      title,
      type: deriveType(deadline, cadence),
      category: String(formData.get("category") || "") || null,
      important: true,
      deadline,
      referee: String(formData.get("referee") || "") || null,
      cadence,
    },
  });
  revalidatePath("/");
}

export async function remove(id: number) {
  await prisma.item.delete({ where: { id } });
  revalidatePath("/");
}

// Defer with intent. Clearing lastNudgedAt lets the next sweep treat the
// resurfacing as a fresh nudge rather than an ignore.
export async function snoozeItem(id: number, preset: string) {
  if (!isSnoozePreset(preset)) return;
  await prisma.item.update({
    where: { id },
    data: {
      snoozeUntil: snoozeUntil(preset, new Date()),
      lastNudgedAt: null,
      deferCount: { increment: 1 },
    },
  });
  await prisma.event.create({ data: { itemId: id, kind: "snoozed" } });
  revalidatePath("/");
}

