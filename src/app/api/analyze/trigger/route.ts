// ============================================================
// API: /api/analyze/trigger
// ============================================================
// Ručno pokretanje Vision analize za projekt.
// Koristi se za testiranje i re-analizu.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { qAnalyze, qBrandRebuild } from "@/lib/jobs";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local"; // TODO: Get from auth

// ============================================================
// POST /api/analyze/trigger
// Pokreće analizu svih ne-analiziranih slika
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { force = false } = body;

    log("api:analyze", "trigger_request", { force });

    // Dohvati sve IG assete koji nisu analizirani
    let query = `
      SELECT a.id, a.url, a.metadata
      FROM assets a
      WHERE a.project_id = $1 
        AND a.source = 'instagram'
        AND a.type = 'image'
    `;

    if (!force) {
      query += `
        AND NOT EXISTS (
          SELECT 1 FROM instagram_analyses ia WHERE ia.asset_id = a.id
        )
      `;
    }

    query += ` ORDER BY a.created_at DESC`;

    const assets = await q<any>(query, [PROJECT_ID]);

    if (assets.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No assets to analyze",
        queued: 0
      });
    }

    // Kreiraj rebuild event
    const eventId = "evt_" + uuid();
    
    await q(
      `INSERT INTO brand_rebuild_events (
        id, project_id, trigger_type, status, 
        total_expected, analyses_completed
      )
      VALUES ($1, $2, 'instagram_ingest', 'analyzing', $3, 0)`,
      [eventId, PROJECT_ID, assets.length]
    );

    // Queue sve analize
    for (const asset of assets) {
      const caption = asset.metadata?.caption;
      
      await qAnalyze.add("analyze.instagram", {
        asset_id: asset.id,
        project_id: PROJECT_ID,
        image_url: asset.url,
        caption,
        rebuild_event_id: eventId
      });
    }

    log("api:analyze", "trigger_complete", {
      queued: assets.length,
      event_id: eventId
    });

    return NextResponse.json({
      ok: true,
      message: `Queued ${assets.length} assets for analysis`,
      queued: assets.length,
      event_id: eventId
    });

  } catch (error: any) {
    log("api:analyze", "trigger_error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// GET /api/analyze/status
// Vraća status analize za projekt
// ============================================================

export async function GET(req: Request) {
  try {
    // Ukupno asseta
    const totalAssets = await q<any>(
      `SELECT COUNT(*) as count 
       FROM assets 
       WHERE project_id = $1 AND source = 'instagram' AND type = 'image'`,
      [PROJECT_ID]
    );

    // Analiziranih
    const analyzed = await q<any>(
      `SELECT COUNT(*) as count 
       FROM instagram_analyses ia
       JOIN assets a ON a.id = ia.asset_id
       WHERE a.project_id = $1`,
      [PROJECT_ID]
    );

    // Detektiranih proizvoda
    const products = await q<any>(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
              SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed
       FROM detected_products
       WHERE project_id = $1`,
      [PROJECT_ID]
    );

    // Zadnji rebuild event
    const lastEvent = await q<any>(
      `SELECT id, trigger_type, status, total_expected, analyses_completed, created_at, completed_at
       FROM brand_rebuild_events
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [PROJECT_ID]
    );

    return NextResponse.json({
      total_assets: parseInt(totalAssets[0]?.count || "0"),
      analyzed_assets: parseInt(analyzed[0]?.count || "0"),
      products: {
        total: parseInt(products[0]?.total || "0"),
        pending: parseInt(products[0]?.pending || "0"),
        confirmed: parseInt(products[0]?.confirmed || "0")
      },
      last_event: lastEvent[0] || null
    });

  } catch (error: any) {
    log("api:analyze", "status_error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
