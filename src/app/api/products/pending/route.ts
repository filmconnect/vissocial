// ============================================================
// src/app/api/products/pending/route.ts
// ============================================================
// Vraća listu proizvoda koji čekaju potvrdu.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

export async function GET(req: Request) {
  try {
    // Get unique pending products grouped by name
    const products = await q<any>(
      `SELECT 
         MIN(id) as id,
         product_name,
         category,
         MAX(confidence) as confidence,
         COUNT(*) as detection_count,
         array_agg(DISTINCT asset_id) as asset_ids,
         MIN(first_seen_at) as first_seen,
         MAX(last_seen_at) as last_seen
       FROM detected_products 
       WHERE project_id = $1 AND status = 'pending'
       GROUP BY product_name, category
       ORDER BY detection_count DESC, confidence DESC
       LIMIT 50`,
      [PROJECT_ID]
    );

    // Get sample images for each product
    const productsWithImages = await Promise.all(
      products.map(async (p: any) => {
        // Get first asset image
        const asset = await q<any>(
          `SELECT url FROM assets WHERE id = $1`,
          [p.asset_ids[0]]
        );

        return {
          id: p.id,
          product_name: p.product_name,
          category: p.category,
          confidence: parseFloat(p.confidence || "0"),
          detection_count: parseInt(p.detection_count),
          first_seen: p.first_seen,
          last_seen: p.last_seen,
          sample_image: asset[0]?.url || null
        };
      })
    );

    return NextResponse.json({
      products: productsWithImages,
      total: productsWithImages.length
    });

  } catch (error: any) {
    log("api:products", "pending list error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
