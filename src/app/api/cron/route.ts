import { NextRequest, NextResponse } from "next/server";
import { runSweep, runTimedSweep, runDigestTick } from "@/lib/sweep";

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
  // PRD-18: one external job hits this endpoint every ~5 min with no slot. Each
  // tick fires any precise timed pings AND evaluates every user's local clock,
  // sending their 08:00 / 20:00 digest once it's that hour where they are. The
  // forced morning/evening slots are kept for manual sends; `timed` for the
  // legacy timed-only checker.
  let result: { sent: number; users: number };
  if (slotParam === "morning" || slotParam === "evening") {
    result = await runSweep(slotParam);
  } else if (slotParam === "timed") {
    result = await runTimedSweep();
  } else {
    const now = new Date();
    const [timed, digest] = await Promise.all([runTimedSweep(now), runDigestTick(now)]);
    result = { sent: timed.sent + digest.sent, users: digest.users };
  }
  // Report only safe counters: how many users got a nudge, out of how many.
  return NextResponse.json({ sent: result.sent, users: result.users });
}
