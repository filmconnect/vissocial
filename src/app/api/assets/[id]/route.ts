// ============================================================
// API: /api/assets/[id]
// ============================================================
// Brisanje pojedinačnog asseta.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Dohvati asset
    const asset = await q<any>(`SELECT * FROM assets WHERE id = $1`, [id]);
    
    if (asset.length === 0) {
      return NextResponse.json(
        { success: false, error: "Asset not found" },
        { status: 404 }
      );
    }

    log("api:assets:delete", "deleting", {
      id,
      label: asset[0].label,
      url: asset[0].url
    });

    // Obriši iz baze (MinIO cleanup može se dodati kasnije kao job)
    await q(`DELETE FROM assets WHERE id = $1`, [id]);

    log("api:assets:delete", "deleted", { id });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    log("api:assets:delete", "error", { id, error: error.message });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// GET single asset
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const asset = await q<any>(`SELECT * FROM assets WHERE id = $1`, [id]);
    
    if (asset.length === 0) {
      return NextResponse.json(
        { error: "Asset not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ asset: asset[0] });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
