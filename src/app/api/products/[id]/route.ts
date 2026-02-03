// ============================================================
// API: /api/products/[id]
// ============================================================
// GET - Dohvati pojedinačni proizvod
// PATCH - Editiraj proizvod (name, category, locked)
// DELETE - Obriši proizvod
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

// ============================================================
// GET - Dohvati proizvod
// ============================================================
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const product = await q<any>(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    if (product.length === 0) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ product: product[0] });

  } catch (error: any) {
    log("api:products", "get_error", { id, error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH - Editiraj proizvod
// ============================================================
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const updates = await req.json();

    // Provjeri postoji li proizvod
    const existing = await q<any>(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Build dynamic UPDATE query
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.category !== undefined) {
      setClauses.push(`category = $${paramIndex++}`);
      values.push(updates.category);
    }
    if (updates.locked !== undefined) {
      setClauses.push(`locked = $${paramIndex++}`);
      values.push(updates.locked);
    }
    if (updates.confirmed !== undefined) {
      setClauses.push(`confirmed = $${paramIndex++}`);
      values.push(updates.confirmed);
    }
    if (updates.confidence !== undefined) {
      setClauses.push(`confidence = $${paramIndex++}`);
      values.push(updates.confidence);
    }

    if (setClauses.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid updates provided" },
        { status: 400 }
      );
    }

    values.push(id);

    await q(
      `UPDATE products SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    // Dohvati ažurirani proizvod
    const updated = await q<any>(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    log("api:products", "updated", { 
      id, 
      updated_fields: Object.keys(updates) 
    });

    return NextResponse.json({ 
      success: true, 
      product: updated[0] 
    });

  } catch (error: any) {
    log("api:products", "update_error", { id, error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// DELETE - Obriši proizvod
// ============================================================
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Provjeri postoji li
    const existing = await q<any>(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    if (existing.length === 0) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    await q(`DELETE FROM products WHERE id = $1`, [id]);

    log("api:products", "deleted", { id });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    log("api:products", "delete_error", { id, error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
