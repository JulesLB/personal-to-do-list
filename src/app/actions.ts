"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { snoozeUntil, isSnoozePreset } from "@/lib/snooze";

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

// Edit any field Claude guessed. Deadlines are stored at 09:00 HKT to match the
// rest of the app. Empty selects/date clear the field; a blank title is ignored
// so a stray submit can't wipe the item.
export async function updateItem(id: number, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const deadlineStr = String(formData.get("deadline") ?? "");
  const deadline = deadlineStr ? new Date(deadlineStr + "T09:00:00+08:00") : null;
  // A parked idea with a real date isn't parked any more: giving it a deadline
  // promotes it straight into the actionable list.
  const wantedType = String(formData.get("type") || "task");
  const type = wantedType === "parking" && deadline ? "task" : wantedType;
  await prisma.item.update({
    where: { id },
    data: {
      title,
      type,
      category: String(formData.get("category") || "") || null,
      referee: String(formData.get("referee") || "") || null,
      cadence: String(formData.get("cadence") || "") || null,
      important: formData.get("important") != null,
      urgent: formData.get("urgent") != null,
      deadline,
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
    data: { snoozeUntil: snoozeUntil(preset, new Date()), lastNudgedAt: null },
  });
  await prisma.event.create({ data: { itemId: id, kind: "snoozed" } });
  revalidatePath("/");
}

