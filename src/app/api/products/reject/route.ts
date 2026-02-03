// ============================================================
// API: /api/products/reject
// ============================================================
// Odbija proizvod da se ne koristi u generiranju sadržaja
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
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

    await q(
      `UPDATE detected_products SET status = 'rejected' WHERE id = $1`,
      [product_id]
    );

    log("api:products", "rejected", { product_id });

    return NextResponse.json({ ok: true, status: "rejected" });
  } catch (error: any) {
    log("api:products", "reject_error", { error: error.message });
    return NextResponse.json(
      { error: "Failed to reject product" },
      { status: 500 }
    );
  }
}
