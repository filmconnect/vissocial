// ============================================================
// API: /api/analyze/status
// ============================================================
// Vraća status Vision analize za projekt.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local"; // TODO: Get from auth

export async function GET(req: Request) {
  try {
    // Ukupno IG slika
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

    // Pending (čeka analizu)
    const pending = await q<any>(
      `SELECT COUNT(*) as count 
       FROM assets a
       WHERE a.project_id = $1 
         AND a.source = 'instagram' 
         AND a.type = 'image'
         AND NOT EXISTS (
           SELECT 1 FROM instagram_analyses ia WHERE ia.asset_id = a.id
         )`,
      [PROJECT_ID]
    );

    // Detektirani proizvodi
    const products = await q<any>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
       FROM detected_products
       WHERE project_id = $1`,
      [PROJECT_ID]
    );

    // Unique proizvodi (grupirani po imenu)
    const uniqueProducts = await q<any>(
      `SELECT product_name, category, MAX(confidence) as confidence, COUNT(*) as frequency
       FROM detected_products
       WHERE project_id = $1 AND status = 'pending'
       GROUP BY product_name, category
       ORDER BY frequency DESC, confidence DESC
       LIMIT 20`,
      [PROJECT_ID]
    );

    // Zadnji rebuild eventi
    const recentEvents = await q<any>(
      `SELECT id, trigger_type, status, total_expected, analyses_completed, 
              created_at, completed_at, error_message
       FROM brand_rebuild_events
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [PROJECT_ID]
    );

    // Brand profile status
    const brandProfile = await q<any>(
      `SELECT 
         profile->'_metadata'->>'based_on_posts' as based_on_posts,
         profile->'_metadata'->>'auto_generated_at' as last_generated,
         profile->'_metadata'->>'version' as version,
         jsonb_array_length(COALESCE(profile->'products', '[]'::jsonb)) as products_in_profile
       FROM brand_profiles
       WHERE project_id = $1`,
      [PROJECT_ID]
    );

    const total = parseInt(totalAssets[0]?.count || "0");
    const analyzedCount = parseInt(analyzed[0]?.count || "0");
    const pendingCount = parseInt(pending[0]?.count || "0");

    return NextResponse.json({
      assets: {
        total,
        analyzed: analyzedCount,
        pending: pendingCount,
        progress_percent: total > 0 ? Math.round((analyzedCount / total) * 100) : 0
      },
      detected_products: {
        total: parseInt(products[0]?.total || "0"),
        pending: parseInt(products[0]?.pending || "0"),
        confirmed: parseInt(products[0]?.confirmed || "0"),
        rejected: parseInt(products[0]?.rejected || "0")
      },
      unique_pending_products: uniqueProducts,
      brand_profile: brandProfile[0] || null,
      recent_events: recentEvents.map((e: any) => ({
        ...e,
        progress_percent: e.total_expected > 0 
          ? Math.round((e.analyses_completed / e.total_expected) * 100) 
          : 0
      }))
    });

  } catch (error: any) {
    log("api:analyze:status", "error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
