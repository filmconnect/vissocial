// ============================================================
// ANALYZE INSTAGRAM PROCESSOR (FIXED)
// ============================================================
// Analizira Instagram sliku s GPT-4 Vision.
//
// SCHEMA ALIGNMENT:
// instagram_analyses table has:
//   id, asset_id, analysis (JSONB), model_version, tokens_used, analyzed_at
// 
// NO project_id column - derived via: asset_id → assets → project_id
// NO extracted columns - all data in single analysis JSONB
// ============================================================

import { q } from "@/lib/db";
import { analyzeInstagramPost } from "@/lib/vision";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { qBrandRebuild } from "@/lib/jobs";
import { makePublicUrl, validateVisionUrl } from "@/lib/storageUrl";

// ============================================================
// TYPES
// ============================================================

export interface AnalyzeInstagramInput {
  asset_id: string;
  project_id: string;
  image_url: string;
  caption?: string;
  rebuild_event_id?: string;
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
    image_url: image_url?.substring(0, 80),
    has_caption: !!caption,
    rebuild_event_id
  });

  try {
    // =========================================================
    // 1. VALIDATE & FIX IMAGE URL
    // OpenAI Vision requires HTTPS URL
    // =========================================================
    
    let visionUrl = image_url;
    
    // Check if URL needs fixing
    const validation = validateVisionUrl(image_url);
    
    if (!validation.valid) {
      log("analyzeInstagram", "url_invalid", { 
        asset_id, 
        original_url: image_url?.substring(0, 80),
        error: validation.error
      });

      // Try to get correct URL from database
      const [asset] = await q<any>(
        `SELECT url FROM assets WHERE id = $1`,
        [asset_id]
      );

      if (asset?.url) {
        const fixedValidation = validateVisionUrl(asset.url);
        if (fixedValidation.valid) {
          visionUrl = fixedValidation.url;
          log("analyzeInstagram", "url_fixed_from_db", {
            asset_id,
            fixed_url: visionUrl.substring(0, 80)
          });
        } else {
          // Last resort: construct URL from APP_URL
          visionUrl = makePublicUrl(asset.url);
          log("analyzeInstagram", "url_constructed", {
            asset_id,
            constructed_url: visionUrl.substring(0, 80)
          });
        }
      }

      // Final validation
      if (!visionUrl || !visionUrl.startsWith("https://")) {
        throw new Error(
          `Cannot create valid HTTPS URL for Vision API. ` +
          `Original: ${image_url?.substring(0, 50)}, ` +
          `APP_URL: ${process.env.APP_URL}`
        );
      }
    } else {
      visionUrl = validation.url;
    }

    // =========================================================
    // 2. CHECK IF ALREADY ANALYZED
    // =========================================================
    
    const existingAnalysis = await q<any>(
      `SELECT id FROM instagram_analyses WHERE asset_id = $1`,
      [asset_id]
    );

    if (existingAnalysis.length > 0) {
      log("analyzeInstagram", "already_analyzed", { asset_id });
      
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
    // 3. CALL VISION API
    // =========================================================
    
    log("analyzeInstagram", "calling_vision_api", { 
      asset_id,
      url: visionUrl.substring(0, 100)
    });
    
    const analysis = await analyzeInstagramPost(visionUrl, caption);

    log("analyzeInstagram", "vision_complete", {
      asset_id,
      products_found: analysis.products?.length || 0,
      mood: analysis.visual_style?.mood,
      colors: analysis.visual_style?.dominant_colors?.length || 0
    });

    // =========================================================
    // 4. SAVE ANALYSIS TO DATABASE
    // 
    // SCHEMA: id, asset_id, analysis, model_version, tokens_used, analyzed_at
    // NOTE: No project_id column - this is by design!
    // =========================================================
    
    const analysisId = "ana_" + uuid();
    
    await q(
      `INSERT INTO instagram_analyses (id, asset_id, analysis, model_version, analyzed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (asset_id) DO UPDATE SET
         analysis = EXCLUDED.analysis,
         model_version = EXCLUDED.model_version,
         analyzed_at = NOW()`,
      [
        analysisId, 
        asset_id, 
        JSON.stringify(analysis),
        "gpt-4o"
      ]
    );

    log("analyzeInstagram", "analysis_saved", { analysis_id: analysisId });

    // =========================================================
    // 5. SAVE DETECTED PRODUCTS
    // =========================================================
    
    let productsInserted = 0;

    for (const product of analysis.products || []) {
      const productId = "det_" + uuid();
      
      try {
        await q(
          `INSERT INTO detected_products (
            id, project_id, asset_id, analysis_id, product_name, category,
            visual_features, prominence, confidence, source, status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'instagram_vision', 'pending')
          ON CONFLICT (asset_id, product_name) 
          DO UPDATE SET 
            frequency = detected_products.frequency + 1,
            last_seen_at = NOW(),
            confidence = GREATEST(detected_products.confidence, EXCLUDED.confidence),
            visual_features = COALESCE(EXCLUDED.visual_features, detected_products.visual_features),
            analysis_id = COALESCE(EXCLUDED.analysis_id, detected_products.analysis_id)`,
          [
            productId,
            project_id,
            asset_id,
            analysisId,
            product.name || "Unknown",
            product.category || "other",
            JSON.stringify(product.visual_features || []),
            product.prominence || "medium",
            product.confidence || 0.5
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
      products_inserted: productsInserted
    });

    // =========================================================
    // 6. UPDATE PROGRESS COUNTER
    // =========================================================
    
    if (rebuild_event_id) {
      await incrementAnalysisCounter(rebuild_event_id, project_id);
    }

    const duration = Date.now() - startTime;
    
    log("analyzeInstagram", "complete", {
      asset_id,
      analysis_id: analysisId,
      products_found: analysis.products?.length || 0,
      duration_ms: duration
    });

    return {
      success: true,
      asset_id,
      products_found: analysis.products?.length || 0,
      analysis_id: analysisId
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    log("analyzeInstagram", "error", {
      asset_id,
      error: error.message,
      stack: error.stack?.substring(0, 500),
      duration_ms: duration
    });

    // Still update counter to not block rebuild
    if (rebuild_event_id) {
      try {
        await incrementAnalysisCounter(rebuild_event_id, project_id);
      } catch {
        // Ignore
      }
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
// HELPER: Increment rebuild event counter
// ============================================================

async function incrementAnalysisCounter(
  eventId: string,
  projectId: string
): Promise<void> {
  try {
    await q(
      `UPDATE brand_rebuild_events 
       SET analyses_completed = COALESCE(analyses_completed, 0) + 1
       WHERE id = $1`,
      [eventId]
    );

    // Check if rebuild should trigger
    const [event] = await q<any>(
      `SELECT id, total_expected, analyses_completed, status
       FROM brand_rebuild_events
       WHERE id = $1`,
      [eventId]
    );

    if (event && event.status === "ready") {
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
  } catch (error: any) {
    log("analyzeInstagram", "counter_update_error", {
      event_id: eventId,
      error: error.message
    });
  }
}

// ============================================================
// REANALYZE (for manual re-run)
// ============================================================

export async function reanalyzeAsset(asset_id: string): Promise<AnalyzeInstagramResult> {
  const [asset] = await q<any>(
    `SELECT a.id, a.project_id, a.url, a.metadata
     FROM assets a
     WHERE a.id = $1`,
    [asset_id]
  );

  if (!asset) {
    return {
      success: false,
      asset_id,
      products_found: 0,
      error: "Asset not found"
    };
  }

  // Delete old data
  await q(`DELETE FROM instagram_analyses WHERE asset_id = $1`, [asset_id]);
  await q(`DELETE FROM detected_products WHERE asset_id = $1`, [asset_id]);

  return analyzeInstagram({
    asset_id,
    project_id: asset.project_id,
    image_url: asset.url,
    caption: asset.metadata?.caption
  });
}
