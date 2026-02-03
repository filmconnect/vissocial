// ============================================================
// API: /api/products/confirm
// ============================================================
// Potvrđuje proizvod za korištenje u generiranju sadržaja.
// 1. Označava detected_product kao 'confirmed'
// 2. Kopira u products tablicu ako ne postoji
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const { product_id } = await req.json();

    if (!product_id) {
      return NextResponse.json(
        { error: "product_id required" },
        { status: 400 }
      );
    }

    // 1. Dohvati detected_product
    const detected = await q<any>(
      `SELECT * FROM detected_products WHERE id = $1`,
      [product_id]
    );

    if (detected.length === 0) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    const dp = detected[0];

    // 2. Označi kao confirmed
    await q(
      `UPDATE detected_products SET status = 'confirmed' WHERE id = $1`,
      [product_id]
    );

    // 3. Provjeri postoji li već u products tablici
    const existingProduct = await q<any>(
      `SELECT id FROM products 
       WHERE project_id = $1 AND LOWER(name) = LOWER($2)`,
      [dp.project_id, dp.product_name]
    );

    let finalProductId = existingProduct[0]?.id;

    if (existingProduct.length === 0) {
      // 4. Kopiraj u products tablicu
      finalProductId = "prod_" + uuid();
      await q(
        `INSERT INTO products (id, project_id, name, category, confidence, confirmed, locked)
         VALUES ($1, $2, $3, $4, $5, true, false)`,
        [
          finalProductId,
          dp.project_id,
          dp.product_name,
          dp.category || "other",
          dp.confidence || 0.8
        ]
      );

      log("api:products", "copied_to_products", { 
        detected_id: product_id,
        product_id: finalProductId,
        name: dp.product_name
      });
    } else {
      // Ažuriraj existing product kao confirmed
      await q(
        `UPDATE products SET confirmed = true WHERE id = $1`,
        [finalProductId]
      );
    }

    log("api:products", "confirmed", { product_id });

    return NextResponse.json({ 
      ok: true, 
      status: "confirmed",
      product_id: finalProductId
    });

  } catch (error: any) {
    log("api:products", "confirm_error", { error: error.message });
    return NextResponse.json(
      { error: "Failed to confirm product" },
      { status: 500 }
    );
  }
}
