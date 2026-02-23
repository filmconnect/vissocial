// ============================================================
// POST /api/debug/clean-failed
// ============================================================
// Briše sve failed jobove iz svih queues.
// Pozovi jednom nakon deploya da očistiš stare SSL errore.
// ============================================================

import { NextResponse } from "next/server";
import { allQueues } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function POST() {
  const results: Record<string, any> = {};

  for (const [name, queue] of Object.entries(allQueues)) {
    try {
      const failedCount = await queue.getFailedCount();
      if (failedCount > 0) {
        await queue.clean(0, 1000, "failed");  // clean all failed jobs
        results[name] = { cleaned: failedCount };
      } else {
        results[name] = { cleaned: 0 };
      }
    } catch (e: any) {
      results[name] = { error: e.message };
    }
  }

  return NextResponse.json({
    ts: new Date().toISOString(),
    action: "clean-failed",
    results,
  });
}
