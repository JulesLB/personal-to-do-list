import { NextRequest, NextResponse } from "next/server";
import { runSweep, type Slot } from "@/lib/sweep";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Fail closed: a missing CRON_SECRET must lock the endpoint, not open it.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const slot: Slot = req.nextUrl.searchParams.get("slot") === "evening" ? "evening" : "morning";
  const result = await runSweep(slot);
  // Don't echo chatId back; report only the safe counters.
  return NextResponse.json({ sent: result.sent, topId: result.topId });
}
