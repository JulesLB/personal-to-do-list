"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
  await prisma.item.update({
    where: { id },
    data: {
      title,
      type: String(formData.get("type") || "task"),
      category: String(formData.get("category") || "") || null,
      referee: String(formData.get("referee") || "") || null,
      cadence: String(formData.get("cadence") || "") || null,
      important: formData.get("important") != null,
      urgent: formData.get("urgent") != null,
      deadline: deadlineStr ? new Date(deadlineStr + "T09:00:00+08:00") : null,
    },
  });
  revalidatePath("/");
}

export async function remove(id: number) {
  await prisma.item.delete({ where: { id } });
  revalidatePath("/");
}
