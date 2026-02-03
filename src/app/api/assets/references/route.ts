// ============================================================
// API: /api/assets/references
// ============================================================
// Dohvaća sve reference grupirane po tipu.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const project_id = searchParams.get("project_id") || "proj_local";

  try {
    const assets = await q<any>(
      `SELECT id, url, label, metadata, created_at 
       FROM assets 
       WHERE project_id = $1 
       AND label IN ('style_reference', 'product_reference', 'character_reference')
       ORDER BY label, created_at DESC`,
      [project_id]
    );

    const grouped = {
      style_reference: assets.filter((a: any) => a.label === "style_reference"),
      product_reference: assets.filter((a: any) => a.label === "product_reference"),
      character_reference: assets.filter((a: any) => a.label === "character_reference")
    };

    log("api:assets:references", "fetched", {
      project_id,
      total: assets.length,
      style: grouped.style_reference.length,
      product: grouped.product_reference.length,
      character: grouped.character_reference.length
    });

    return NextResponse.json({
      references: grouped,
      total_count: assets.length,
      max_for_generation: 8,
      max_per_label: 5
    });

  } catch (error: any) {
    log("api:assets:references", "error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
