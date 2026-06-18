"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function markDone(id: number) {
  await prisma.item.update({ where: { id }, data: { status: "done", doneAt: new Date() } });
  revalidatePath("/");
}

export async function remove(id: number) {
  await prisma.item.delete({ where: { id } });
  revalidatePath("/");
}
