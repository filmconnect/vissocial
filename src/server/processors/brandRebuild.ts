// ============================================================
// BRAND REBUILD PROCESSOR
// ============================================================
// Agregira Vision analize u brand profil.
// UPDATED: Koristi notifications library s deduplication
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { notify } from "@/lib/notifications";

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

      // Označi kao completed ali bez promjena
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
    // 4. Dohvati CONFIRMED proizvode + frequency iz detected_products
    // =========================================================
    const confirmedProducts = await q<any>(
      `
      SELECT
        p.id,
        p.name,
        p.category,
        p.confidence,
        p.locked,
        COALESCE(dp.freq, 0) as frequency
      FROM products p
      LEFT JOIN (
        SELECT
          project_id,
          product_name,
          COUNT(*) as freq
        FROM detected_products
        WHERE project_id = $1
        GROUP BY project_id, product_name
      ) dp ON dp.product_name = p.name
      WHERE p.project_id = $1
        AND p.confirmed = true
      ORDER BY p.confidence DESC
      `,
      [project_id]
    );

    // Dodaj frequency iz detected_products
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
    // 6. Izračunaj caption patterns
    // =========================================================
    const captionPatterns = analyzeCaptionPatterns(analyses);

    // =========================================================
    // 7. Brand consistency score
    // =========================================================
    const brandConsistency = calculateBrandConsistency(visualStyle, analyses);

    // =========================================================
    // 8. Sastavi finalni brand profil
    // =========================================================
    const profile: BrandProfile = {
      _metadata: {
        confidence_level: "auto",
        based_on_posts: analyses.length,
        last_manual_override: null,
        auto_generated_at: new Date().toISOString(),
        version: 1
      },
      visual_style: visualStyle,
      products: productsWithFrequency,
      content_themes: contentThemes,
      caption_patterns: captionPatterns,
      brand_consistency: brandConsistency
    };

    // =========================================================
    // 9. Spremi u bazu
    // =========================================================
    await q(
      `INSERT INTO brand_profiles (project_id, profile, language)
       VALUES ($1, $2, 'hr')
       ON CONFLICT (project_id) 
       DO UPDATE SET profile = $2`,
      [project_id, JSON.stringify(profile)]
    );

    // =========================================================
    // 10. Pošalji notifikaciju (S DEDUPLICATION!)
    // =========================================================
    const pendingProducts = await q<any>(
      `SELECT COUNT(*) as count FROM detected_products 
       WHERE project_id = $1 AND status = 'pending'`,
      [project_id]
    );

    const pendingCount = Number(pendingProducts[0]?.count) || 0;

    // Koristi notify helper s deduplication
    await notify.analysisComplete(project_id, {
      posts_analyzed: analyses.length,
      products_found: pendingCount,
      dominant_color: visualStyle.dominant_colors[0] || undefined
    });

    log("brandRebuild", "notification_sent", {
      project_id,
      pending_products: pendingCount
    });

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
  const colorCounts: Record<string, number> = {};
  const styleCounts: Record<string, number> = {};
  const lightingCounts: Record<string, number> = {};
  const moodCounts: Record<string, number> = {};
  const compositionCounts: Record<string, number> = {};

  for (const row of analyses) {
    const analysis = typeof row.analysis === "string"
      ? JSON.parse(row.analysis)
      : row.analysis;

    const vs = analysis.visual_style || {};

    // Colors
    if (vs.dominant_colors) {
      for (const color of vs.dominant_colors) {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
      }
    }

    // Style
    if (vs.photography_style) {
      styleCounts[vs.photography_style] = (styleCounts[vs.photography_style] || 0) + 1;
    }

    // Lighting
    if (vs.lighting) {
      lightingCounts[vs.lighting] = (lightingCounts[vs.lighting] || 0) + 1;
    }

    // Mood
    if (vs.mood) {
      moodCounts[vs.mood] = (moodCounts[vs.mood] || 0) + 1;
    }

    // Composition
    if (vs.composition_patterns) {
      for (const pattern of vs.composition_patterns) {
        compositionCounts[pattern] = (compositionCounts[pattern] || 0) + 1;
      }
    }
  }

  // Sort by frequency and take top items
  const sortByFreq = (obj: Record<string, number>, limit: number) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => key);

  const topMood = Object.entries(moodCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    dominant_colors: sortByFreq(colorCounts, 5),
    photography_styles: sortByFreq(styleCounts, 3),
    lighting_preferences: sortByFreq(lightingCounts, 3),
    mood: topMood ? topMood[0] : "neutral",
    composition_patterns: sortByFreq(compositionCounts, 4)
  };
}

function extractContentThemes(analyses: any[]): string[] {
  const themeCounts: Record<string, number> = {};

  for (const row of analyses) {
    const analysis = typeof row.analysis === "string"
      ? JSON.parse(row.analysis)
      : row.analysis;

    const themes = analysis.content_themes || [];
    for (const theme of themes) {
      themeCounts[theme] = (themeCounts[theme] || 0) + 1;
    }
  }

  return Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([theme]) => theme);
}

function analyzeCaptionPatterns(analyses: any[]): BrandProfile["caption_patterns"] {
  let totalLength = 0;
  let emojiCount = 0;
  let hashtagTotal = 0;
  let count = 0;

  const toneCounts: Record<string, number> = {};

  for (const row of analyses) {
    const metadata = typeof row.metadata === "string"
      ? JSON.parse(row.metadata)
      : row.metadata;

    const caption = metadata?.caption || "";

    if (caption) {
      count++;
      totalLength += caption.length;

      // Count emojis (simple regex)
      const emojis = caption.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]/gu);
      if (emojis) emojiCount++;

      // Count hashtags
      const hashtags = caption.match(/#\w+/g);
      if (hashtags) hashtagTotal += hashtags.length;
    }

    const analysis = typeof row.analysis === "string"
      ? JSON.parse(row.analysis)
      : row.analysis;

    const tone = analysis.caption_tone || analysis.tone || "neutral";
    toneCounts[tone] = (toneCounts[tone] || 0) + 1;
  }

  const topTone = Object.entries(toneCounts)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    average_length: count > 0 ? Math.round(totalLength / count) : 150,
    tone: topTone ? topTone[0] : "neutral",
    emoji_usage: count > 0 ? (emojiCount / count) > 0.5 : true,
    hashtag_avg: count > 0 ? Math.round(hashtagTotal / count) : 5
  };
}

function calculateBrandConsistency(
  visualStyle: BrandProfile["visual_style"],
  analyses: any[]
): BrandProfile["brand_consistency"] {
  // Simple consistency calculation
  // Could be more sophisticated with ML

  let colorConsistency = 0;
  let styleConsistency = 0;

  if (visualStyle.dominant_colors.length > 0) {
    // More colors = less consistent (simplified)
    colorConsistency = Math.max(0, 100 - (visualStyle.dominant_colors.length - 1) * 15);
  }

  if (visualStyle.photography_styles.length > 0) {
    // More styles = less consistent
    styleConsistency = Math.max(0, 100 - (visualStyle.photography_styles.length - 1) * 20);
  }

  // Determine overall aesthetic
  let aesthetic = "eclectic";
  if (colorConsistency > 70 && styleConsistency > 70) {
    aesthetic = "highly consistent";
  } else if (colorConsistency > 50 && styleConsistency > 50) {
    aesthetic = "moderately consistent";
  } else if (colorConsistency > 30 || styleConsistency > 30) {
    aesthetic = "varied";
  }

  return {
    color_consistency_score: colorConsistency,
    style_consistency_score: styleConsistency,
    overall_aesthetic: aesthetic
  };
}
