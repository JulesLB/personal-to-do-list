import type { Item } from "@prisma/client";
import { commitmentDue } from "./rank";

const DAY = 86400000;
const HK_OFFSET = 8 * 60 * 60 * 1000;
const dayNum = (d: Date) => Math.floor((d.getTime() + HK_OFFSET) / DAY);

// "Hot days survived": how many days in a row, ending today, you've cleared what
// came due without letting a fire pass its day unhandled. A day breaks the streak
// only if a task or commitment fell due that day and nothing was completed; days
// with nothing due never break it, so a quiet stretch carries the streak forward
// instead of killing it. Today is still in progress, so it can only add, never
// break. Reads the append-only done Events for "you cleared something that day"
// and item deadlines / commitment due dates for "a fire was due that day".
export function currentStreak(
  items: Item[],
  dones: { createdAt: Date }[],
  now: Date,
): number {
  const today = dayNum(now);
  const cleared = new Set(dones.map((e) => dayNum(e.createdAt)));
  const dueDays = new Set<number>();
  for (const i of items) {
    if (i.deadline) dueDays.add(dayNum(i.deadline));
    if (i.type === "commitment") dueDays.add(dayNum(commitmentDue(i)));
  }
  let streak = 0;
  for (let d = today; d > today - 366; d--) {
    const didClear = cleared.has(d);
    if (d === today) {
      if (didClear) streak++;
      continue;
    }
    if (dueDays.has(d) && !didClear) break;
    if (didClear) streak++;
  }
  return streak;
}
