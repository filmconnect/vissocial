// ============================================================
// BRAND REBUILD PROCESSOR (WITH NOTIFICATIONS)
// ============================================================
// Agregira Vision analize u brand profil.
// FIXED: Dodani notify pozivi za chat notifikacije
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { pushNotification } from "@/lib/notifications";

// ============================================================
// TYPES
// ============================================================

export interface BrandRebuildInput {
  project_id: string;
  event_id?: string;
  trigger: "analysis_complete" | "product_confirmed" | "manual_update" | "onboarding_complete";
}

export interface BrandProfileMetadata {
  confidence_level: "auto" | "manual" | "hybrid";
  based_on_posts: number;
  last_manual_override: string | null;
  auto_generated_at: string;
  version: number;
}

export interface BrandProfile {
  _metadata: BrandProfileMetadata;
  visual_style: {
    dominant_colors: string[];
    photography_styles: string[];
    lighting_preferences: string[];
    mood: string;
    composition_patterns: string[];
  };
  products: Array<{
    id: string;
    name: string;
    category: string;
    frequency: number;
    visual_features: string[];
    locked: boolean;
  }>;
  content_themes: string[];
  caption_patterns: {
    average_length: number;
    tone: string;
    emoji_usage: boolean;
    hashtag_avg: number;
  };
  brand_consistency: {
    color_consistency_score: number;
    style_consistency_score: number;
    overall_aesthetic: string;
  };
}

export interface BrandRebuildResult {
  success: boolean;
  project_id: string;
  products_count: number;
  posts_analyzed: number;
  error?: string;
}

// ============================================================
// MAIN PROCESSOR
// ============================================================

export async function brandRebuild(
  data: BrandRebuildInput
): Promise<BrandRebuildResult> {
  
  const startTime = Date.now();
  const { project_id, event_id, trigger } = data;

  log("brandRebuild", "start", {
    project_id,
    event_id,
    trigger
  });

  try {
    // =========================================================
    // 1. Update event status
    // =========================================================
    if (event_id) {
      await q(
        `UPDATE brand_rebuild_events 
         SET status = 'rebuilding', started_at = NOW()
         WHERE id = $1`,
        [event_id]
      );
    }

    // =========================================================
    // 2. Dohvati sve Vision analize za projekt
    // =========================================================
    const analyses = await q<any>(
      `SELECT ia.analysis, a.metadata
       FROM instagram_analyses ia
       JOIN assets a ON a.id = ia.asset_id
       WHERE a.project_id = $1
       ORDER BY ia.analyzed_at DESC
       LIMIT 50`,
      [project_id]
    );

    if (analyses.length === 0) {
      log("brandRebuild", "no_analyses_found", { project_id });
      
      if (event_id) {
        await q(
          `UPDATE brand_rebuild_events 
           SET status = 'skipped', completed_at = NOW(),
               metadata = jsonb_set(COALESCE(metadata, '{}'), '{reason}', '"no_analyses"')
           WHERE id = $1`,
          [event_id]
        );
      }
      
      return {
        success: true,
        project_id,
        products_count: 0,
        posts_analyzed: 0
      };
    }

    log("brandRebuild", "analyses_loaded", {
      project_id,
      count: analyses.length
    });

    // =========================================================
    // 3. Agregiraj Visual Style
    // =========================================================
    const visualStyle = aggregateVisualStyle(analyses);

    // =========================================================
    // 4. Dohvati CONFIRMED proizvode + frequency
    // =========================================================
    const confirmedProducts = await q<any>(
      `SELECT p.id, p.name, p.category, p.confidence, p.locked,
              COALESCE(dp.freq, 0) as frequency
       FROM products p
       LEFT JOIN (
         SELECT project_id, product_name, COUNT(*) as freq
         FROM detected_products
         WHERE project_id = $1
         GROUP BY project_id, product_name
       ) dp ON dp.product_name = p.name
       WHERE p.project_id = $1 AND p.confirmed = true
       ORDER BY p.confidence DESC`,
      [project_id]
    );

    const productsWithFrequency = confirmedProducts.map((p: any) => ({
      id: p.id,
      name: p.name,
      category: p.category || "other",
      frequency: Number(p.frequency) || 0,
      visual_features: [],
      locked: p.locked || false
    }));

    // =========================================================
    // 5. Izvuci content themes
    // =========================================================
    const contentThemes = extractContentThemes(analyses);

    // =========================================================
    // 6. Analiziraj caption patterns
    // =========================================================
    const captionPatterns = analyzeCaptionPatterns(analyses);

    // =========================================================
    // 7. Izračunaj brand consistency
    // =========================================================
    const brandConsistency = calculateBrandConsistency(analyses, visualStyle);

    // =========================================================
    // 8. Dohvati postojeći profil za version number
    // =========================================================
    const existingProfile = await q<any>(
      `SELECT profile FROM brand_profiles WHERE project_id = $1`,
      [project_id]
    );
    
    const currentVersion = existingProfile[0]?.profile?._metadata?.version || 0;

    // =========================================================
    // 9. Build final profile
    // =========================================================
    const profile: BrandProfile = {
      _metadata: {
        confidence_level: "auto",
        based_on_posts: analyses.length,
        last_manual_override: null,
        auto_generated_at: new Date().toISOString(),
        version: currentVersion + 1
      },
      visual_style: visualStyle,
      products: productsWithFrequency,
      content_themes: contentThemes,
      caption_patterns: captionPatterns,
      brand_consistency: brandConsistency
    };

    // =========================================================
    // 10. Spremi u bazu
    // =========================================================
    await q(
      `INSERT INTO brand_profiles (project_id, profile, language)
       VALUES ($1, $2, 'hr')
       ON CONFLICT (project_id) 
       DO UPDATE SET profile = $2`,
      [project_id, JSON.stringify(profile)]
    );

    // =========================================================
    // 11. Update event status
    // =========================================================
    const duration = Date.now() - startTime;
    
    if (event_id) {
      await q(
        `UPDATE brand_rebuild_events 
         SET status = 'completed', completed_at = NOW(),
             metadata = jsonb_set(
               COALESCE(metadata, '{}'), 
               '{duration_ms}', 
               $2::text::jsonb
             )
         WHERE id = $1`,
        [event_id, duration.toString()]
      );
    }

    // =========================================================
    // 12. ✅ SEND NOTIFICATION TO CHAT
    // =========================================================
    const pendingProducts = await q<any>(
      `SELECT COUNT(*) as count FROM detected_products 
       WHERE project_id = $1 AND status = 'pending'`,
      [project_id]
    );
    const pendingCount = parseInt(pendingProducts[0]?.count || "0");

    // Build notification message
    let notificationText = `✅ Analiza završena!\n\n`;
    notificationText += `📊 Analizirano: ${analyses.length} objava\n`;
    notificationText += `🎨 Dominantna boja: ${visualStyle.dominant_colors[0] || "N/A"}\n`;
    notificationText += `📸 Stil: ${visualStyle.mood || "N/A"}\n`;
    
    if (pendingCount > 0) {
      notificationText += `\n🏷️ Pronađeno ${pendingCount} proizvoda za potvrdu.`;
    }

    // Send notification with chip
    await pushNotification({
      project_id,
      type: "analysis_complete",
      title: "Analiza gotova",
      message: notificationText,
      data: {
        posts_analyzed: analyses.length,
        products_detected: pendingCount,
        dominant_color: visualStyle.dominant_colors[0],
        mood: visualStyle.mood
      },
      chips: pendingCount > 0 
        ? [{ type: "suggestion", label: "Prikaži proizvode", value: "Prikaži proizvode" }]
        : [{ type: "suggestion", label: "Generiraj plan", value: "Generiraj plan" }]
    });

    log("brandRebuild", "notification_sent", {
      project_id,
      pending_products: pendingCount
    });

    log("brandRebuild", "complete", {
      project_id,
      posts_analyzed: analyses.length,
      products_count: productsWithFrequency.length,
      dominant_color: visualStyle.dominant_colors[0],
      duration_ms: duration
    });

    return {
      success: true,
      project_id,
      products_count: productsWithFrequency.length,
      posts_analyzed: analyses.length
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    log("brandRebuild", "error", {
      project_id,
      error: error.message,
      duration_ms: duration
    });

    if (event_id) {
      await q(
        `UPDATE brand_rebuild_events 
         SET status = 'failed', completed_at = NOW(),
             error_message = $2
         WHERE id = $1`,
        [event_id, error.message]
      );
    }

    // Send error notification
    try {
      await pushNotification({
        project_id,
        type: "job_failed",
        title: "Greška u analizi",
        message: `Analiza nije uspjela: ${error.message}`,
        data: { error: error.message }
      });
    } catch {}

    return {
      success: false,
      project_id,
      products_count: 0,
      posts_analyzed: 0,
      error: error.message
    };
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function aggregateVisualStyle(analyses: any[]): BrandProfile["visual_style"] {
  const colors: Record<string, number> = {};
  const styles: Record<string, number> = {};
  const lighting: Record<string, number> = {};
  const moods: Record<string, number> = {};
  const patterns: Record<string, number> = {};

  for (const row of analyses) {
    const analysis = typeof row.analysis === "string" 
      ? JSON.parse(row.analysis) 
      : row.analysis;
    
    const vs = analysis?.visual_style;
    if (!vs) continue;

    // Colors
    for (const c of vs.dominant_colors || []) {
      colors[c] = (colors[c] || 0) + 1;
    }

    // Style
    if (vs.photography_style) {
      styles[vs.photography_style] = (styles[vs.photography_style] || 0) + 1;
    }

    // Lighting
    if (vs.lighting) {
      lighting[vs.lighting] = (lighting[vs.lighting] || 0) + 1;
    }

    // Mood
    if (vs.mood) {
      moods[vs.mood] = (moods[vs.mood] || 0) + 1;
    }

    // Patterns
    for (const p of vs.composition_patterns || []) {
      patterns[p] = (patterns[p] || 0) + 1;
    }
  }

  const sortByCount = (obj: Record<string, number>) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k]) => k);

  return {
    dominant_colors: sortByCount(colors).slice(0, 5),
    photography_styles: sortByCount(styles).slice(0, 3),
    lighting_preferences: sortByCount(lighting).slice(0, 3),
    mood: sortByCount(moods)[0] || "unknown",
    composition_patterns: sortByCount(patterns).slice(0, 4)
  };
}

function extractContentThemes(analyses: any[]): string[] {
  const themes: Record<string, number> = {};

  for (const row of analyses) {
    const analysis = typeof row.analysis === "string"
      ? JSON.parse(row.analysis)
      : row.analysis;
    
    const desc = analysis?.raw_description || "";
    
    // Simple keyword extraction
    const keywords = desc.toLowerCase()
      .split(/\s+/)
      .filter((w: string) => w.length > 4);
    
    for (const kw of keywords) {
      themes[kw] = (themes[kw] || 0) + 1;
    }
  }

  return Object.entries(themes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);
}

function analyzeCaptionPatterns(analyses: any[]): BrandProfile["caption_patterns"] {
  let totalLength = 0;
  let emojiCount = 0;
  let hashtagTotal = 0;
  let count = 0;

  for (const row of analyses) {
    const caption = row.metadata?.caption;
    if (!caption) continue;

    count++;
    totalLength += caption.length;
    
    // Count emojis (rough)
    const emojis = caption.match(/[\u{1F300}-\u{1F9FF}]/gu) || [];
    emojiCount += emojis.length;
    
    // Count hashtags
    const hashtags = caption.match(/#\w+/g) || [];
    hashtagTotal += hashtags.length;
  }

  return {
    average_length: count > 0 ? Math.round(totalLength / count) : 0,
    tone: "professional", // Default, could be analyzed with LLM
    emoji_usage: count > 0 ? emojiCount / count > 1 : false,
    hashtag_avg: count > 0 ? Math.round(hashtagTotal / count) : 0
  };
}

function calculateBrandConsistency(
  analyses: any[],
  visualStyle: BrandProfile["visual_style"]
): BrandProfile["brand_consistency"] {
  // Simple consistency check based on how many posts match dominant style
  let colorMatches = 0;
  let styleMatches = 0;

  const dominantColor = visualStyle.dominant_colors[0];
  const dominantStyle = visualStyle.photography_styles[0];

  for (const row of analyses) {
    const analysis = typeof row.analysis === "string"
      ? JSON.parse(row.analysis)
      : row.analysis;
    
    const vs = analysis?.visual_style;
    if (!vs) continue;

    if (vs.dominant_colors?.includes(dominantColor)) {
      colorMatches++;
    }
    if (vs.photography_style === dominantStyle) {
      styleMatches++;
    }
  }

  const total = analyses.length || 1;

  return {
    color_consistency_score: Math.round((colorMatches / total) * 100),
    style_consistency_score: Math.round((styleMatches / total) * 100),
    overall_aesthetic: visualStyle.mood || "mixed"
  };
}
