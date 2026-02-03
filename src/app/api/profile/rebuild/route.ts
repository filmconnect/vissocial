// ============================================================
// API: /api/profile/rebuild
// ============================================================
// POST - Pokreće ručni brand rebuild
// ============================================================

import { NextResponse } from "next/server";
import { qBrandRebuild } from "@/lib/jobs";
import { v4 as uuid } from "uuid";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

export async function POST() {
  try {
    // Provjeri ima li analiziranih postova
    const analyzed = await q<any>(
      `SELECT COUNT(*) as count FROM instagram_analyses ia
       JOIN assets a ON a.id = ia.asset_id
       WHERE a.project_id = $1`,
      [PROJECT_ID]
    );

    if (parseInt(analyzed[0]?.count || "0") === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Nema analiziranih postova. Prvo poveži Instagram." 
        },
        { status: 400 }
      );
    }

    const eventId = "evt_" + uuid();

    // Kreiraj event
    await q(
      `INSERT INTO brand_rebuild_events 
       (id, project_id, trigger_type, status, total_expected, analyses_completed)
       VALUES ($1, $2, 'manual_update', 'pending', 0, 0)`,
      [eventId, PROJECT_ID]
    );

    // Queue job
    await qBrandRebuild.add("brand.rebuild", {
      project_id: PROJECT_ID,
      event_id: eventId,
      trigger: "manual_update"
    });

    log("api:profile:rebuild", "queued", { event_id: eventId });

    return NextResponse.json({ 
      success: true, 
      event_id: eventId,
      message: "Brand rebuild pokrenut. Osvježi stranicu za par sekundi."
    });

  } catch (error: any) {
    log("api:profile:rebuild", "error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
