// ============================================================
// API: /api/products (POST)
// ============================================================
// POST - Ručno dodaj novi proizvod
// GET - Lista svih proizvoda za projekt
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

// ============================================================
// GET - Lista svih proizvoda
// ============================================================
export async function GET() {
  try {
    const products = await q<any>(
      `SELECT * FROM products 
       WHERE project_id = $1 
       ORDER BY confirmed DESC, created_at DESC`,
      [PROJECT_ID]
    );

    return NextResponse.json({ products });

  } catch (error: any) {
    log("api:products", "list_error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// POST - Dodaj novi proizvod
// ============================================================
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { name, category, confidence } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Product name is required" },
        { status: 400 }
      );
    }

    // Provjeri duplikat
    const existing = await q<any>(
      `SELECT id FROM products 
       WHERE project_id = $1 AND LOWER(name) = LOWER($2)`,
      [PROJECT_ID, name.trim()]
    );

    if (existing.length > 0) {
      return NextResponse.json(
        { success: false, error: "Product with this name already exists" },
        { status: 400 }
      );
    }

    const productId = "prod_" + uuid();

    await q(
      `INSERT INTO products (id, project_id, name, category, confidence, confirmed, locked)
       VALUES ($1, $2, $3, $4, $5, true, true)`,
      [
        productId,
        PROJECT_ID,
        name.trim(),
        category || "other",
        confidence || 1.0  // Ručno dodani imaju confidence 1.0
      ]
    );

    // Dohvati kreirani proizvod
    const created = await q<any>(
      `SELECT * FROM products WHERE id = $1`,
      [productId]
    );

    log("api:products", "created", { 
      id: productId, 
      name: name.trim(),
      category: category || "other"
    });

    return NextResponse.json({ 
      success: true, 
      product: created[0] 
    });

  } catch (error: any) {
    log("api:products", "create_error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
