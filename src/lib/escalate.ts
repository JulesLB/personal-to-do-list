import type { Item } from "@prisma/client";
import { isCritical } from "./rank";

// The graduated ladder, pure so it's unit-testable. The sweep supplies the two
// facts it can't know on its own (have we warned / sent already this cycle), read
// from the Event table; everything else is derived from the item.
//
//   none  → no auto-send. Copy may still escalate via the nudge tier, but the
//           server stays its hand (not critical, not important, no opted-in
//           referee, or already sent this cycle).
//   warn  → tell the owner once: "tap it, or next time I send it for you."
//   send  → the one-tap window is past; auto-send through the controlled channel.
export type EscalationStep = "none" | "warn" | "send";

export function escalationStep(opts: {
  item: Item;
  now: Date;
  optedIn: boolean;
  alreadyWarned: boolean;
  alreadySent: boolean;
}): EscalationStep {
  const { item, now, optedIn, alreadyWarned, alreadySent } = opts;
  if (!item.important) return "none";
  if (!isCritical(item, now)) return "none";
  if (!optedIn) return "none"; // escalated copy still fires; just no real send
  if (alreadySent) return "none"; // hard guard: at most one auto-send per cycle
  return alreadyWarned ? "send" : "warn";
}
