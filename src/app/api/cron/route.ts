import { NextRequest, NextResponse } from "next/server";
import { runSweep } from "@/lib/nudge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const result = await runSweep();
  return NextResponse.json(result);
}
