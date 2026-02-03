// ============================================================
// API: /api/assets/upload
// ============================================================
// Upload referentnih slika za fal.ai generiranje.
// Podržava: style_reference, product_reference, character_reference
// ============================================================

import { NextResponse } from "next/server";
import { putObject } from "@/lib/storage";
import { makePublicUrl } from "@/lib/makePublicUrl";
import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_LABELS = ["style_reference", "product_reference", "character_reference"];
const MAX_PER_LABEL = 5;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const label = formData.get("label") as string;
    const project_id = (formData.get("project_id") as string) || "proj_local";

    log("api:assets:upload", "request received", {
      label,
      project_id,
      file_size: file?.size,
      file_type: file?.type
    });

    // =========================================================
    // Validacija
    // =========================================================
    if (!file) {
      return NextResponse.json(
        { success: false, error: "Nema datoteke" },
        { status: 400 }
      );
    }

    if (!VALID_LABELS.includes(label)) {
      return NextResponse.json(
        { success: false, error: "Nevažeća oznaka. Dozvoljeno: style_reference, product_reference, character_reference" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "Nevažeći format. Dozvoljeno: JPG, PNG, WebP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: "Datoteka prevelika. Max 10MB" },
        { status: 400 }
      );
    }

    // =========================================================
    // Provjeri broj postojećih referenci ovog tipa
    // =========================================================
    const existing = await q<any>(
      `SELECT COUNT(*) as count FROM assets WHERE project_id = $1 AND label = $2`,
      [project_id, label]
    );

    if (parseInt(existing[0]?.count || "0") >= MAX_PER_LABEL) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Maksimalno ${MAX_PER_LABEL} slika po tipu. Obriši neke prvo.` 
        },
        { status: 400 }
      );
    }

    // =========================================================
    // Upload u MinIO
    // =========================================================
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const key = `refs/${project_id}/${label}/${uuid()}.${ext}`;
    
    const uploadedUrl = await putObject(key, buffer, file.type);
    const publicUrl = makePublicUrl(uploadedUrl);

    log("api:assets:upload", "uploaded to storage", {
      key,
      publicUrl
    });

    // =========================================================
    // Spremi u bazu
    // =========================================================
    const assetId = "asset_" + uuid();
    await q(
      `INSERT INTO assets (id, project_id, type, source, url, label, metadata)
       VALUES ($1, $2, 'image', 'upload', $3, $4, $5)`,
      [
        assetId,
        project_id,
        publicUrl,
        label,
        JSON.stringify({
          original_name: file.name,
          size: file.size
        })
      ]
    );

    log("api:assets:upload", "saved to database", {
      asset_id: assetId,
      label
    });

    return NextResponse.json({
      success: true,
      asset: {
        id: assetId,
        url: publicUrl,
        label,
        created_at: new Date().toISOString()
      }
    });

  } catch (error: any) {
    log("api:assets:upload", "error", { error: error.message });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
