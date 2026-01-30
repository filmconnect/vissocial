// ============================================================
// ANALYZE INSTAGRAM PROCESSOR
// ============================================================
// Analizira pojedinačnu Instagram sliku s GPT-4 Vision.
// Sprema rezultate u instagram_analyses i detected_products.
// Triggera brand rebuild kad su sve analize završene.
// ============================================================

import { q } from "@/lib/db";
import { analyzeInstagramPost, VisionAnalysisResult } from "@/lib/vision";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { config } from "@/lib/config";
import { qBrandRebuild } from "@/lib/jobs";

// ============================================================
// TYPES
// ============================================================

export interface AnalyzeInstagramInput {
  asset_id: string;
  project_id: string;
  image_url: string;
  caption?: string;
  rebuild_event_id?: string; // Za tracking napretka
}

export interface AnalyzeInstagramResult {
  success: boolean;
  asset_id: string;
  products_found: number;
  analysis_id?: string;
  error?: string;
}

// ============================================================
// MAIN PROCESSOR
// ============================================================

export async function analyzeInstagram(
  data: AnalyzeInstagramInput
): Promise<AnalyzeInstagramResult> {
  
  const startTime = Date.now();
  const { asset_id, project_id, image_url, caption, rebuild_event_id } = data;

  log("analyzeInstagram", "start", {
    asset_id,
    project_id,
    has_caption: !!caption,
    rebuild_event_id
  });

  try {
    // =========================================================
    // 1. Provjeri da asset postoji i nije već analiziran
    // =========================================================
    const existingAnalysis = await q<any>(
      `SELECT id FROM instagram_analyses WHERE asset_id = $1`,
      [asset_id]
    );

    if (existingAnalysis.length > 0) {
      log("analyzeInstagram", "already_analyzed", { asset_id });
      
      // Ipak updateaj progress ako postoji rebuild_event_id
      if (rebuild_event_id) {
        await incrementAnalysisCounter(rebuild_event_id, project_id);
      }
      
      return {
        success: true,
        asset_id,
        products_found: 0,
        analysis_id: existingAnalysis[0].id
      };
    }

    // =========================================================
    // 2. Pozovi Vision API
    // =========================================================
    log("analyzeInstagram", "calling_vision_api", { asset_id });
    
    const analysis = await analyzeInstagramPost(image_url, caption);

    log("analyzeInstagram", "vision_complete", {
      asset_id,
      products_found: analysis.products.length,
      mood: analysis.visual_style.mood,
      colors: analysis.visual_style.dominant_colors.length
    });

    // =========================================================
    // 3. Spremi analizu u bazu
    // =========================================================
    const analysisId = "ana_" + uuid();
    
    await q(
      `INSERT INTO instagram_analyses (id, asset_id, analysis, model_version, analyzed_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [analysisId, asset_id, JSON.stringify(analysis), "gpt-4o"]
    );

    log("analyzeInstagram", "analysis_saved", { analysis_id: analysisId });

    // =========================================================
    // 4. Spremi detektirane proizvode
    // =========================================================
    let productsInserted = 0;

    for (const product of analysis.products) {
      const productId = "det_" + uuid();
      
      try {
        await q(
          `INSERT INTO detected_products (
            id, project_id, asset_id, product_name, category,
            visual_features, prominence, confidence, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
          ON CONFLICT (asset_id, product_name) 
          DO UPDATE SET 
            frequency = detected_products.frequency + 1,
            last_seen_at = NOW(),
            confidence = GREATEST(detected_products.confidence, EXCLUDED.confidence),
            visual_features = COALESCE(
              detected_products.visual_features,
              EXCLUDED.visual_features
            )`,
          [
            productId,
            project_id,
            asset_id,
            product.name,
            product.category,
            JSON.stringify(product.visual_features),
            product.prominence,
            product.confidence
          ]
        );
        productsInserted++;
      } catch (productError: any) {
        log("analyzeInstagram", "product_insert_error", {
          product_name: product.name,
          error: productError.message
        });
      }
    }

    log("analyzeInstagram", "products_saved", {
      asset_id,
      products_inserted: productsInserted,
      products_found: analysis.products.length
    });

    // =========================================================
    // 5. Update napredak i provjeri treba li rebuild
    // =========================================================
    if (rebuild_event_id) {
      await incrementAnalysisCounter(rebuild_event_id, project_id);
    }

    const duration = Date.now() - startTime;
    
    log("analyzeInstagram", "complete", {
      asset_id,
      analysis_id: analysisId,
      products_found: analysis.products.length,
      duration_ms: duration
    });

    return {
      success: true,
      asset_id,
      products_found: analysis.products.length,
      analysis_id: analysisId
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    log("analyzeInstagram", "error", {
      asset_id,
      error: error.message,
      duration_ms: duration
    });

    // Ipak updateaj counter da ne blokira rebuild
    if (rebuild_event_id) {
      await incrementAnalysisCounter(rebuild_event_id, project_id);
    }

    return {
      success: false,
      asset_id,
      products_found: 0,
      error: error.message
    };
  }
}

// ============================================================
// HELPER: Increment Analysis Counter
// ============================================================

async function incrementAnalysisCounter(
  eventId: string,
  projectId: string
): Promise<void> {
  try {
    // Increment counter
    await q(
      `UPDATE brand_rebuild_events 
       SET analyses_completed = analyses_completed + 1
       WHERE id = $1`,
      [eventId]
    );

    // Provjeri je li sve gotovo
    const event = await q<any>(
      `SELECT id, total_expected, analyses_completed, status
       FROM brand_rebuild_events
       WHERE id = $1`,
      [eventId]
    );

    if (event.length > 0) {
      const e = event[0];
      
      log("analyzeInstagram", "progress_update", {
        event_id: eventId,
        completed: e.analyses_completed,
        total: e.total_expected,
        status: e.status
      });

      // Ako su sve analize gotove i status je 'ready', pokreni rebuild
      // (trigger u bazi automatski stavlja status='ready' kad analyses_completed >= total_expected)
      if (e.status === "ready") {
        log("analyzeInstagram", "triggering_brand_rebuild", {
          event_id: eventId,
          project_id: projectId
        });

        await qBrandRebuild.add("brand.rebuild", {
          project_id: projectId,
          event_id: eventId,
          trigger: "analysis_complete"
        });
      }
    }
  } catch (error: any) {
    log("analyzeInstagram", "counter_update_error", {
      event_id: eventId,
      error: error.message
    });
  }
}

// ============================================================
// BATCH PROCESSOR (za bulk analizu)
// ============================================================

export interface AnalyzeBatchInput {
  project_id: string;
  assets: Array<{
    asset_id: string;
    image_url: string;
    caption?: string;
  }>;
}

export async function analyzeInstagramBatch(
  data: AnalyzeBatchInput
): Promise<{
  success: boolean;
  total: number;
  completed: number;
  failed: number;
  event_id: string;
}> {
  const { project_id, assets } = data;
  
  log("analyzeInstagramBatch", "start", {
    project_id,
    total_assets: assets.length
  });

  // Kreiraj rebuild event za tracking
  const eventId = "evt_" + uuid();
  
  await q(
    `INSERT INTO brand_rebuild_events (
      id, project_id, trigger_type, status, 
      total_expected, analyses_completed
    )
    VALUES ($1, $2, 'instagram_ingest', 'analyzing', $3, 0)`,
    [eventId, project_id, assets.length]
  );

  let completed = 0;
  let failed = 0;

  // Procesiraj jedan po jedan (queue će paralelizirati ako treba)
  for (const asset of assets) {
    const result = await analyzeInstagram({
      asset_id: asset.asset_id,
      project_id,
      image_url: asset.image_url,
      caption: asset.caption,
      rebuild_event_id: eventId
    });

    if (result.success) {
      completed++;
    } else {
      failed++;
    }
  }

  log("analyzeInstagramBatch", "complete", {
    project_id,
    event_id: eventId,
    total: assets.length,
    completed,
    failed
  });

  return {
    success: failed === 0,
    total: assets.length,
    completed,
    failed,
    event_id: eventId
  };
}

// ============================================================
// REANALYZE (za ručni re-run)
// ============================================================

export async function reanalyzeAsset(asset_id: string): Promise<AnalyzeInstagramResult> {
  // Dohvati asset podatke
  const asset = await q<any>(
    `SELECT a.id, a.project_id, a.url, a.metadata
     FROM assets a
     WHERE a.id = $1`,
    [asset_id]
  );

  if (asset.length === 0) {
    return {
      success: false,
      asset_id,
      products_found: 0,
      error: "Asset not found"
    };
  }

  // Obriši staru analizu
  await q(`DELETE FROM instagram_analyses WHERE asset_id = $1`, [asset_id]);
  await q(`DELETE FROM detected_products WHERE asset_id = $1`, [asset_id]);

  // Pokreni novu analizu
  const caption = asset[0].metadata?.caption;
  
  return analyzeInstagram({
    asset_id,
    project_id: asset[0].project_id,
    image_url: asset[0].url,
    caption
  });
}
