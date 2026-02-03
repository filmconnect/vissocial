// ============================================================
// API: /api/profile
// ============================================================
// GET - Dohvaća kompletan brand profil s metapodacima
// PATCH - Sprema ručne izmjene profila
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { log } from "@/lib/logger";

const PROJECT_ID = "proj_local";

// ============================================================
// GET - Dohvati brand profil
// ============================================================
export async function GET() {
  try {
    // Dohvati brand profil
    const profileRow = await q<any>(
      `SELECT profile FROM brand_profiles WHERE project_id = $1`,
      [PROJECT_ID]
    );

    // Dohvati projekt info
    const project = await q<any>(
      `SELECT ig_connected, ig_user_id FROM projects WHERE id = $1`,
      [PROJECT_ID]
    );

    // Dohvati broj analiziranih postova
    const analyzed = await q<any>(
      `SELECT COUNT(*) as count FROM instagram_analyses ia
       JOIN assets a ON a.id = ia.asset_id
       WHERE a.project_id = $1`,
      [PROJECT_ID]
    );

    // Dohvati pending proizvode (iz detected_products)
    const pending = await q<any>(
      `SELECT COUNT(DISTINCT product_name) as count 
       FROM detected_products 
       WHERE project_id = $1 AND status = 'pending'`,
      [PROJECT_ID]
    );

    // Dohvati confirmed proizvode (iz products tablice) - PUNA LISTA
    const confirmedProducts = await q<any>(
      `SELECT p.id, p.name, p.category, p.confidence, p.locked,
              COALESCE(dp.freq, 0) as frequency
       FROM products p
       LEFT JOIN (
         SELECT project_id, product_name, COUNT(*) as freq
         FROM detected_products
         WHERE project_id = $1
         GROUP BY project_id, product_name
       ) dp ON dp.product_name = p.name AND dp.project_id = p.project_id
       WHERE p.project_id = $1 AND p.confirmed = true
       ORDER BY frequency DESC, p.created_at DESC`,
      [PROJECT_ID]
    );

    // Formatiraj proizvode za response
    const productsFormatted = confirmedProducts.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category || "other",
      frequency: parseInt(p.frequency) || 0,
      visual_features: [],  // TODO: dohvatiti iz detected_products
      locked: p.locked || false
    }));

    // Dohvati reference count
    const refs = await q<any>(
      `SELECT label, COUNT(*) as count 
       FROM assets 
       WHERE project_id = $1 
       AND label IN ('style_reference', 'product_reference', 'character_reference')
       GROUP BY label`,
      [PROJECT_ID]
    );

    const refCounts: Record<string, number> = {
      style_reference: 0,
      product_reference: 0,
      character_reference: 0
    };
    refs.forEach((r: any) => {
      refCounts[r.label] = parseInt(r.count);
    });

    // Dohvati reference slike URLs za preview (max 3 po tipu)
    const refPreviews = await q<any>(
      `SELECT id, url, label FROM assets 
       WHERE project_id = $1 
       AND label IN ('style_reference', 'product_reference', 'character_reference')
       ORDER BY created_at DESC
       LIMIT 9`,
      [PROJECT_ID]
    );

    // Grupiraj po tipu
    const refImages: Record<string, Array<{ id: string; url: string }>> = {
      style_reference: [],
      product_reference: [],
      character_reference: []
    };
    refPreviews.forEach((r: any) => {
      if (refImages[r.label].length < 3) {
        refImages[r.label].push({ id: r.id, url: r.url });
      }
    });

    // Zadnji rebuild
    const lastRebuild = await q<any>(
      `SELECT completed_at FROM brand_rebuild_events 
       WHERE project_id = $1 AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [PROJECT_ID]
    );

    log("api:profile", "fetched", {
      has_profile: !!profileRow[0]?.profile,
      posts_analyzed: analyzed[0]?.count,
      pending_products: pending[0]?.count,
      confirmed_products: productsFormatted.length
    });

    return NextResponse.json({
      brand_profile: profileRow[0]?.profile || null,
      instagram_connected: !!project[0]?.ig_connected,
      posts_analyzed: parseInt(analyzed[0]?.count || "0"),
      pending_products: parseInt(pending[0]?.count || "0"),
      confirmed_products: productsFormatted,  // Lista umjesto count
      references: refCounts,
      reference_images: refImages,
      last_rebuild: lastRebuild[0]?.completed_at || null
    });

  } catch (error: any) {
    log("api:profile", "error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// ============================================================
// PATCH - Spremi izmjene profila
// ============================================================
export async function PATCH(req: Request) {
  try {
    const updates = await req.json();

    // Dohvati postojeći profil
    const existing = await q<any>(
      `SELECT profile FROM brand_profiles WHERE project_id = $1`,
      [PROJECT_ID]
    );

    const currentProfile = existing[0]?.profile || {};
    const currentMetadata = currentProfile._metadata || {
      confidence_level: "auto",
      based_on_posts: 0,
      last_manual_override: null,
      auto_generated_at: new Date().toISOString(),
      version: 1
    };

    // Kreiraj ažurirani profil
    const updatedProfile = {
      ...currentProfile,
      _metadata: {
        ...currentMetadata,
        confidence_level: "hybrid", // Označava da je korisnik editirao
        last_manual_override: new Date().toISOString()
      }
    };

    // Apply specific updates
    if (updates.visual_style) {
      updatedProfile.visual_style = {
        ...(currentProfile.visual_style || {}),
        ...updates.visual_style
      };
    }

    if (updates.products !== undefined) {
      updatedProfile.products = updates.products;
    }

    if (updates.content_themes !== undefined) {
      updatedProfile.content_themes = updates.content_themes;
    }

    if (updates.caption_patterns) {
      updatedProfile.caption_patterns = {
        ...(currentProfile.caption_patterns || {}),
        ...updates.caption_patterns
      };
    }

    // Spremi - koristi UPSERT za slučaj da ne postoji
    await q(
      `INSERT INTO brand_profiles (project_id, language, profile)
       VALUES ($1, 'hr', $2)
       ON CONFLICT (project_id) 
       DO UPDATE SET profile = $2`,
      [PROJECT_ID, JSON.stringify(updatedProfile)]
    );

    log("api:profile", "updated", {
      updated_fields: Object.keys(updates)
    });

    return NextResponse.json({ 
      success: true, 
      profile: updatedProfile 
    });

  } catch (error: any) {
    log("api:profile", "update_error", { error: error.message });
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
