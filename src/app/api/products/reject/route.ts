import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { product_id } = body;

    if (!product_id) {
      return NextResponse.json({ error: "product_id required" }, { status: 400 });
    }

    log("api:products:reject", "rejecting product", { product_id });

    // Update product status
    const result = await q(
      `UPDATE detected_products 
       SET status = 'rejected', rejected_at = NOW()
       WHERE id = $1
       RETURNING id, product_name, status`,
      [product_id]
    );

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    log("api:products:reject", "product rejected", { 
      product_id, 
      product_name: result[0].product_name 
    });

    return NextResponse.json({ 
      success: true, 
      product: result[0] 
    });
  } catch (error: any) {
    log("api:products:reject", "error", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
