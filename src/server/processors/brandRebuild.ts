// ============================================================
// BRAND REBUILD PROCESSOR
// ============================================================
// Agregira Vision analize u brand profil.
// Event-driven - triggera se kad su sve analize završene
// ili kad korisnik potvrdi proizvod / update profile.
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

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
	// NOTE:
	// - user potvrđuje SAMO proizvod (name)
	// - category dolazi automatski iz Vision AI (detected_products)
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
    // 6. Analiziraj caption patterns (iz asset metadata)
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
  // Collect all values
  const allColors: string[] = [];
  const allStyles: string[] = [];
  const allLighting: string[] = [];
  const allMoods: string[] = [];
  const allCompositions: string[] = [];

  for (const a of analyses) {
    const analysis = a.analysis;
    if (!analysis?.visual_style) continue;

    const vs = analysis.visual_style;
    
    if (Array.isArray(vs.dominant_colors)) {
      allColors.push(...vs.dominant_colors);
    }
    if (vs.photography_style && vs.photography_style !== "unknown") {
      allStyles.push(vs.photography_style);
    }
    if (vs.lighting && vs.lighting !== "unknown") {
      allLighting.push(vs.lighting);
    }
    if (vs.mood && vs.mood !== "unknown") {
      allMoods.push(vs.mood);
    }
    if (Array.isArray(vs.composition_patterns)) {
      allCompositions.push(...vs.composition_patterns);
    }
  }

  return {
    dominant_colors: getTopN(allColors, 5),
    photography_styles: getTopN(allStyles, 3),
    lighting_preferences: getTopN(allLighting, 3),
    mood: mostCommon(allMoods) || "professional",
    composition_patterns: getTopN(allCompositions, 4)
  };
}

function extractContentThemes(analyses: any[]): string[] {
  const themes = new Set<string>();
  
  for (const a of analyses) {
    const products = a.analysis?.products || [];
    for (const p of products) {
      if (p.category && p.category !== "other") {
        themes.add(p.category);
      }
    }
  }
  
  return Array.from(themes).slice(0, 10);
}

function analyzeCaptionPatterns(analyses: any[]): BrandProfile["caption_patterns"] {
  const captions: string[] = [];
  
  for (const a of analyses) {
    const caption = a.metadata?.caption;
    if (caption && typeof caption === "string") {
      captions.push(caption);
    }
  }

  if (captions.length === 0) {
    return {
      average_length: 0,
      tone: "neutral",
      emoji_usage: false,
      hashtag_avg: 0
    };
  }

  const avgLength = captions.reduce((sum, c) => sum + c.length, 0) / captions.length;
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/u;
  const emojiUsage = captions.some(c => emojiRegex.test(c));
  const hashtagCounts = captions.map(c => (c.match(/#\w+/g) || []).length);
  const hashtagAvg = hashtagCounts.reduce((a, b) => a + b, 0) / hashtagCounts.length;

  // Detect tone
  const allText = captions.join(" ").toLowerCase();
  let tone = "neutral";
  if (/💪|✨|🔥|❤️|amazing|incredible/.test(allText)) tone = "enthusiastic";
  else if (/profesional|kvalitet|stručn|quality|expert/.test(allText)) tone = "professional";
  else if (/☺️|😊|hvala|thanks|ugodn/.test(allText)) tone = "friendly";

  return {
    average_length: Math.round(avgLength),
    tone,
    emoji_usage: emojiUsage,
    hashtag_avg: Math.round(hashtagAvg * 10) / 10
  };
}

function calculateBrandConsistency(
  analyses: any[],
  aggregatedStyle: BrandProfile["visual_style"]
): BrandProfile["brand_consistency"] {
  
  if (analyses.length < 2) {
    return {
      color_consistency_score: 100,
      style_consistency_score: 100,
      overall_aesthetic: aggregatedStyle.mood
    };
  }

  // Color consistency - kako često se pojavljuju top boje
  const topColors = aggregatedStyle.dominant_colors.slice(0, 3);
  let colorMatches = 0;
  
  for (const a of analyses) {
    const colors = a.analysis?.visual_style?.dominant_colors || [];
    if (topColors.some(tc => colors.includes(tc))) {
      colorMatches++;
    }
  }
  
  const colorConsistency = Math.round((colorMatches / analyses.length) * 100);

  // Style consistency - kako često se pojavljuje dominantni stil
  const topStyle = aggregatedStyle.photography_styles[0];
  let styleMatches = 0;
  
  for (const a of analyses) {
    const style = a.analysis?.visual_style?.photography_style;
    if (style === topStyle) {
      styleMatches++;
    }
  }
  
  const styleConsistency = Math.round((styleMatches / analyses.length) * 100);

  return {
    color_consistency_score: colorConsistency,
    style_consistency_score: styleConsistency,
    overall_aesthetic: aggregatedStyle.mood
  };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function countOccurrences<T>(arr: T[]): Map<T, number> {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return counts;
}

function getTopN<T>(arr: T[], n: number): T[] {
  const counts = countOccurrences(arr);
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([item]) => item);
  return sorted;
}

function mostCommon<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined;
  const counts = countOccurrences(arr);
  let maxCount = 0;
  let maxItem: T | undefined;
  
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }
  
  return maxItem;
}
