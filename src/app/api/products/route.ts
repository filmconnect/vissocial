// ============================================================
// src/app/api/products/route.ts
// ============================================================
// CRUD za potvrđene proizvode.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { qBrandRebuild } from "@/lib/jobs";

const PROJECT_ID = "proj_local";

// ============================================================
// GET - List confirmed products
// ============================================================

export async function GET(req: Request) {
  try {
    const products = await q<any>(
      `SELECT id, name, category, confidence, locked, created_at, updated_at
       FROM products 
       WHERE project_id = $1 AND confirmed = true
       ORDER BY created_at DESC`,
      [PROJECT_ID]
    );

    return NextResponse.json({
      products,
      total: products.length
    });

  } catch (error: any) {
    log("api:products", "list error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// POST - Add new product manually
// ============================================================

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, category } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name required" },
        { status: 400 }
      );
    }

    const id = "prod_" + uuid();

    await q(
      `INSERT INTO products (id, project_id, name, category, confidence, confirmed, locked)
       VALUES ($1, $2, $3, $4, 1.0, true, false)`,
      [id, PROJECT_ID, name, category || "other"]
    );

    // Trigger brand rebuild
    await qBrandRebuild.add("brand.rebuild", {
      project_id: PROJECT_ID,
      trigger: "product_confirmed"
    });

    log("api:products", "product added manually", { id, name });

    return NextResponse.json({
      ok: true,
      product: { id, name, category: category || "other" },
      message: `Proizvod "${name}" dodan.`
    });

  } catch (error: any) {
    log("api:products", "add error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH - Update product
// ============================================================

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, name, category, locked } = body;

    if (!id) {
      return NextResponse.json(
        { error: "id required" },
        { status: 400 }
      );
    }

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      params.push(category);
    }
    if (locked !== undefined) {
      updates.push(`locked = $${paramIndex++}`);
      params.push(locked);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    await q(
      `UPDATE products SET ${updates.join(", ")} WHERE id = $${paramIndex}`,
      params
    );

    log("api:products", "product updated", { id, updates: body });

    return NextResponse.json({
      ok: true,
      message: "Proizvod ažuriran."
    });

  } catch (error: any) {
    log("api:products", "update error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE - Remove product
// ============================================================

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id required" },
        { status: 400 }
      );
    }

    // Check if locked
    const product = await q<any>(
      `SELECT locked, name FROM products WHERE id = $1`,
      [id]
    );

    if (product[0]?.locked) {
      return NextResponse.json(
        { error: "Product is locked", message: "Proizvod je zaključan. Prvo ga otključaj." },
        { status: 400 }
      );
    }

    await q(`DELETE FROM products WHERE id = $1`, [id]);

    // Trigger brand rebuild
    await qBrandRebuild.add("brand.rebuild", {
      project_id: PROJECT_ID,
      trigger: "manual_update"
    });

    log("api:products", "product deleted", { id, name: product[0]?.name });

    return NextResponse.json({
      ok: true,
      message: `Proizvod "${product[0]?.name}" obrisan.`
    });

  } catch (error: any) {
    log("api:products", "delete error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
