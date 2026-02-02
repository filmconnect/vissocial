// ============================================================
// ANALYZE INSTAGRAM PROCESSOR (PATCHED WITH NOTIFICATIONS)
// ============================================================
// Analizira pojedinačnu Instagram sliku s GPT-4 Vision.
// Sprema rezultate u instagram_analyses i detected_products.
// UPDATED: Šalje notifikaciju kad su sve analize završene.
// ============================================================

import { q } from "@/lib/db";
import { analyzeInstagramPost, VisionAnalysisResult } from "@/lib/vision";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { config } from "@/lib/config";
import { qBrandRebuild } from "@/lib/jobs";
import { notify } from "@/lib/notifications";

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
// HELPER: Check if all analyses are complete
// ============================================================

async function checkAndNotifyCompletion(project_id: string): Promise<boolean> {
  const [progress] = await q<any>(
    `SELECT 
       COUNT(*) FILTER (WHERE ia.id IS NOT NULL) as analyzed,
       COUNT(*) as total
     FROM assets a
     LEFT JOIN instagram_analyses ia ON ia.asset_id = a.id
     WHERE a.project_id = $1 AND a.source = 'instagram'`,
    [project_id]
  );

  const analyzed = parseInt(progress.analyzed || "0");
  const total = parseInt(progress.total || "0");
  const isComplete = total > 0 && analyzed >= total;

  if (isComplete) {
    // Count pending products
    const [productCount] = await q<any>(
      `SELECT COUNT(*) as count FROM detected_products 
       WHERE project_id = $1 AND status = 'pending'`,
      [project_id]
    );

    const productsFound = parseInt(productCount?.count || "0");

    // Send notification
    await notify.analysisComplete(project_id, productsFound, total);

    log("analyzeInstagram", "all_complete_notification_sent", {
      project_id,
      total_analyzed: analyzed,
      products_found: productsFound
    });

    return true;
  }

  return false;
}

// ============================================================
// HELPER: Increment rebuild event counter
// ============================================================

async function incrementAnalysisCounter(rebuild_event_id: string, project_id: string) {
  await q(
    `UPDATE brand_rebuild_events 
     SET analyses_completed = COALESCE(analyses_completed, 0) + 1
     WHERE id = $1`,
    [rebuild_event_id]
  );

  // Check if rebuild should trigger
  const [event] = await q<any>(
    `SELECT total_expected, analyses_completed FROM brand_rebuild_events WHERE id = $1`,
    [rebuild_event_id]
  );

  if (event && event.analyses_completed >= event.total_expected) {
    log("analyzeInstagram", "all_analyses_complete_triggering_rebuild", {
      rebuild_event_id,
      project_id
    });
    
    await qBrandRebuild.add("brand.rebuild", {
      project_id,
      trigger: "ingest_complete",
      rebuild_event_id
    });
  }
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
      
      if (rebuild_event_id) {
        await incrementAnalysisCounter(rebuild_event_id, project_id);
      }
      
      // Check if this was the last one
      await checkAndNotifyCompletion(project_id);
      
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
      `INSERT INTO instagram_analyses 
       (id, asset_id, project_id, visual_style, products, caption_analysis, content_classification, raw_response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        analysisId,
        asset_id,
        project_id,
        JSON.stringify(analysis.visual_style),
        JSON.stringify(analysis.products),
        JSON.stringify(analysis.caption_analysis),
        JSON.stringify(analysis.content_classification),
        JSON.stringify(analysis)
      ]
    );

    // =========================================================
    // 4. Spremi detektirane proizvode
    // =========================================================
    let productsFound = 0;

    for (const product of analysis.products) {
      const productId = "det_" + uuid();
      
      try {
        await q(
          `INSERT INTO detected_products 
           (id, project_id, asset_id, analysis_id, product_name, category, confidence, visual_features, source, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'instagram_vision', 'pending')
           ON CONFLICT DO NOTHING`,
          [
            productId,
            project_id,
            asset_id,
            analysisId,
            product.name,
            product.category,
            product.confidence,
            JSON.stringify(product.visual_features || [])
          ]
        );
        productsFound++;
      } catch (e: any) {
        log("analyzeInstagram", "product_insert_error", { 
          product_name: product.name,
          error: e.message 
        });
      }
    }

    // =========================================================
    // 5. Update rebuild event counter
    // =========================================================
    if (rebuild_event_id) {
      await incrementAnalysisCounter(rebuild_event_id, project_id);
    }

    // =========================================================
    // 6. Check if all analyses complete & notify
    // =========================================================
    await checkAndNotifyCompletion(project_id);

    log("analyzeInstagram", "complete", {
      asset_id,
      analysis_id: analysisId,
      products_found: productsFound,
      duration_ms: Date.now() - startTime
    });

    return {
      success: true,
      asset_id,
      products_found: productsFound,
      analysis_id: analysisId
    };

  } catch (error: any) {
    log("analyzeInstagram", "error", {
      asset_id,
      error: error.message,
      stack: error.stack
    });

    // Notify about failure
    await notify.jobFailed(project_id, "analyze.instagram", error.message);

    return {
      success: false,
      asset_id,
      products_found: 0,
      error: error.message
    };
  }
}
