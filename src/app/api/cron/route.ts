import { NextRequest, NextResponse } from "next/server";
import { runSweep, runTimedSweep, type Slot } from "@/lib/sweep";

export const dynamic = "force-dynamic";

// This is a GET that mutates state (sends nudges, writes Events) because Vercel
// Cron only issues GET requests. It's safe despite the method: the Bearer secret
// below is required, so a prefetch / image tag / CSRF can't supply it and trigger
// the sweep. The secret, not the HTTP verb, is the control here.
export async function GET(req: NextRequest) {
  // Fail closed: a missing CRON_SECRET must lock the endpoint, not open it.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const slotParam = req.nextUrl.searchParams.get("slot");
  // M8: the external scheduler hits ?slot=timed every ~15 min to fire any item
  // whose precise dueAt has arrived. The two Vercel crons keep using morning/evening.
  const result =
    slotParam === "timed"
      ? await runTimedSweep()
      : await runSweep(slotParam === "evening" ? "evening" : "morning");
  // Report only safe counters: how many users got a nudge, out of how many.
  return NextResponse.json({ sent: result.sent, users: result.users });
}
