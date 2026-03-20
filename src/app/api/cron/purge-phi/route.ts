import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredPhi } from "@/lib/privacy/phi-retention";

/**
 * Cron-callable endpoint to purge expired PHI conversations.
 * Protect with a CRON_SECRET header in production (Vercel Cron).
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;

  if (expected && secret !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const purged = await purgeExpiredPhi();
  return NextResponse.json({ purged });
}
