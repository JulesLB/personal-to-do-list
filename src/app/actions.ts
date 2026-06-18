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

export async function remove(id: number) {
  await prisma.item.delete({ where: { id } });
  revalidatePath("/");
}
