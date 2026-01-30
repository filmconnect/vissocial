// ============================================================
// VISION.TS - GPT-4 Vision API Wrapper
// ============================================================
// Low-level wrapper za analizu slika.
// POTPUNO ODVOJEN od chat logike - ne zna za sessions, UI, state.
// Lako zamjenjiv s drugim providerom (Claude, Gemini, etc.)
// ============================================================

import { config } from "./config";
import { log } from "./logger";

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface VisualStyle {
  dominant_colors: string[];        // Hex codes: ["#E8B4A0", "#2C3E50"]
  photography_style: string;        // "lifestyle" | "studio" | "flat_lay" | "product_focus"
  lighting: string;                 // "natural" | "studio" | "golden_hour" | "soft"
  mood: string;                     // "cozy" | "professional" | "playful" | "minimal"
  composition_patterns: string[];   // ["rule_of_thirds", "centered"]
}

export interface DetectedProduct {
  name: string;
  category: string;
  visual_features: string[];
  prominence: "high" | "medium" | "low";
  confidence: number; // 0-1
}

export interface BrandElements {
  logo_visible: boolean;
  brand_colors_present: boolean;
  text_overlay: string | null;
}

export interface VisionAnalysisResult {
  visual_style: VisualStyle;
  products: DetectedProduct[];
  brand_elements: BrandElements;
  technical_quality?: {
    resolution: string;
    sharpness: string;
    composition_score: number;
  };
  raw_description?: string;
}

export type AnalysisType = "brand_style" | "product_detection" | "full_analysis";

// ============================================================
// SYSTEM PROMPTS
// ============================================================

const SYSTEM_PROMPTS: Record<AnalysisType, string> = {
  brand_style: `You are an expert brand analyst specializing in visual identity for Instagram content.

Analyze this image and extract visual brand elements. Return ONLY valid JSON with this structure:
{
  "visual_style": {
    "dominant_colors": ["#HEX1", "#HEX2", "#HEX3"],
    "photography_style": "lifestyle|studio|flat_lay|product_focus|outdoor|portrait",
    "lighting": "natural|studio|golden_hour|soft|dramatic|harsh",
    "mood": "cozy|professional|playful|minimal|luxurious|energetic|calm",
    "composition_patterns": ["rule_of_thirds", "centered", "symmetrical", "diagonal"]
  },
  "brand_elements": {
    "logo_visible": false,
    "brand_colors_present": true,
    "text_overlay": null
  }
}

Be specific with hex color codes. Identify the 3-5 most dominant colors.
Return ONLY valid JSON. No markdown, no explanations.`,

  product_detection: `You are a product recognition expert for e-commerce and Instagram content.

Analyze this image and identify ALL visible products/items that could be sold or promoted.
Return ONLY valid JSON with this structure:
{
  "products": [
    {
      "name": "specific product name",
      "category": "book|clothing|electronics|food|cosmetics|home_decor|jewelry|art|other",
      "visual_features": ["feature1", "feature2"],
      "prominence": "high|medium|low",
      "confidence": 0.85
    }
  ]
}

Guidelines:
- Be specific with product names (not just "book" but "hardcover book with brown leather cover")
- prominence: high = main focus, medium = clearly visible, low = background/partial
- confidence: 0.0-1.0 scale, be realistic
- Include ALL products you can identify

Return ONLY valid JSON. No markdown.`,

  full_analysis: `You are a comprehensive Instagram content analyst for brand building and content strategy.

Analyze this image completely. Return ONLY valid JSON with this exact structure:
{
  "visual_style": {
    "dominant_colors": ["#HEX1", "#HEX2", "#HEX3"],
    "photography_style": "lifestyle|studio|flat_lay|product_focus|outdoor|portrait",
    "lighting": "natural|studio|golden_hour|soft|dramatic",
    "mood": "cozy|professional|playful|minimal|luxurious|energetic",
    "composition_patterns": ["rule_of_thirds", "centered", "symmetrical"]
  },
  "products": [
    {
      "name": "specific product name",
      "category": "book|clothing|electronics|food|cosmetics|home_decor|jewelry|art|other",
      "visual_features": ["feature1", "feature2"],
      "prominence": "high|medium|low",
      "confidence": 0.85
    }
  ],
  "brand_elements": {
    "logo_visible": false,
    "brand_colors_present": true,
    "text_overlay": "text if visible or null"
  },
  "technical_quality": {
    "resolution": "high|medium|low",
    "sharpness": "sharp|slightly_soft|blurry",
    "composition_score": 8
  },
  "raw_description": "Brief 1-2 sentence description of the image content"
}

Be specific with:
- Hex color codes (3-5 dominant colors)
- Product names (detailed, not generic)
- Confidence scores (realistic 0-1)

Return ONLY valid JSON. No markdown, no explanations.`
};

// ============================================================
// MAIN FUNCTION: analyzeImage
// ============================================================

/**
 * Analyze an image using GPT-4 Vision API
 * 
 * @param imageUrl - Public URL of the image (must be accessible)
 * @param analysisType - Type of analysis to perform
 * @param additionalContext - Optional context (e.g., Instagram caption)
 * @returns VisionAnalysisResult
 */
export async function analyzeImage(
  imageUrl: string,
  analysisType: AnalysisType = "full_analysis",
  additionalContext?: string
): Promise<VisionAnalysisResult> {
  
  const startTime = Date.now();
  
  log("vision", "analyzeImage:start", {
    imageUrl: imageUrl.substring(0, 80) + (imageUrl.length > 80 ? "..." : ""),
    type: analysisType,
    hasContext: !!additionalContext
  });

  const systemPrompt = SYSTEM_PROMPTS[analysisType];
  
  const userContent: any[] = [
    {
      type: "image_url",
      image_url: {
        url: imageUrl,
        detail: "high" // "low" | "high" | "auto"
      }
    }
  ];

  // Add text prompt
  let textPrompt = "Analyze this image according to the system instructions.";
  if (additionalContext) {
    textPrompt += `\n\nAdditional context (Instagram caption): "${additionalContext}"`;
  }
  
  userContent.push({
    type: "text",
    text: textPrompt
  });

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o", // Vision-capable model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.3 // Lower temperature for consistent analysis
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      log("vision", "analyzeImage:api_error", {
        status: response.status,
        error: errorText
      });
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error("Empty response from Vision API");
    }

    // Parse JSON response
    let analysis: Partial<VisionAnalysisResult>;
    try {
      analysis = JSON.parse(content);
    } catch (parseError) {
      log("vision", "analyzeImage:parse_error", {
        content: content.substring(0, 200)
      });
      throw new Error("Failed to parse Vision API response as JSON");
    }

    // Ensure complete structure
    const result = normalizeAnalysisResult(analysis, analysisType);
    
    const duration = Date.now() - startTime;
    const tokensUsed = data.usage?.total_tokens || 0;
    
    log("vision", "analyzeImage:success", {
      duration_ms: duration,
      tokens_used: tokensUsed,
      products_found: result.products.length,
      dominant_color: result.visual_style.dominant_colors[0] || "none",
      mood: result.visual_style.mood
    });

    return result;

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    log("vision", "analyzeImage:error", {
      duration_ms: duration,
      error: error.message
    });

    // Return fallback structure instead of throwing
    return createFallbackResult(error.message);
  }
}

// ============================================================
// SPECIALIZED WRAPPERS
// ============================================================

/**
 * Analyze Instagram post with caption context
 */
export async function analyzeInstagramPost(
  imageUrl: string,
  caption?: string
): Promise<VisionAnalysisResult> {
  return analyzeImage(imageUrl, "full_analysis", caption);
}

/**
 * Quick product detection only
 */
export async function detectProducts(
  imageUrl: string
): Promise<DetectedProduct[]> {
  const result = await analyzeImage(imageUrl, "product_detection");
  return result.products;
}

/**
 * Extract brand style only (faster, fewer tokens)
 */
export async function extractBrandStyle(
  imageUrl: string
): Promise<VisualStyle> {
  const result = await analyzeImage(imageUrl, "brand_style");
  return result.visual_style;
}

// ============================================================
// BATCH ANALYSIS
// ============================================================

/**
 * Analyze multiple images with rate limiting
 * 
 * @param images - Array of {url, caption?}
 * @param concurrency - Max parallel requests (default: 3)
 * @param delayMs - Delay between batches (default: 1000ms)
 */
export async function analyzeImageBatch(
  images: Array<{ url: string; caption?: string; id?: string }>,
  concurrency: number = 3,
  delayMs: number = 1000
): Promise<Array<{ id?: string; result: VisionAnalysisResult; error?: string }>> {
  
  log("vision", "analyzeImageBatch:start", {
    total: images.length,
    concurrency
  });

  const results: Array<{ id?: string; result: VisionAnalysisResult; error?: string }> = [];
  
  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    
    const batchPromises = batch.map(async (img) => {
      try {
        const result = await analyzeInstagramPost(img.url, img.caption);
        return { id: img.id, result };
      } catch (error: any) {
        return { id: img.id, result: createFallbackResult(error.message), error: error.message };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Rate limit delay between batches
    if (i + concurrency < images.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    log("vision", "analyzeImageBatch:progress", {
      completed: Math.min(i + concurrency, images.length),
      total: images.length
    });
  }

  log("vision", "analyzeImageBatch:complete", {
    total: images.length,
    successful: results.filter(r => !r.error).length,
    failed: results.filter(r => r.error).length
  });

  return results;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Normalize analysis result to ensure complete structure
 */
function normalizeAnalysisResult(
  partial: Partial<VisionAnalysisResult>,
  analysisType: AnalysisType
): VisionAnalysisResult {
  
  const defaultVisualStyle: VisualStyle = {
    dominant_colors: [],
    photography_style: "unknown",
    lighting: "unknown",
    mood: "unknown",
    composition_patterns: []
  };

  const defaultBrandElements: BrandElements = {
    logo_visible: false,
    brand_colors_present: false,
    text_overlay: null
  };

  return {
    visual_style: {
      ...defaultVisualStyle,
      ...(partial.visual_style || {})
    },
    products: Array.isArray(partial.products) ? partial.products.map(normalizeProduct) : [],
    brand_elements: {
      ...defaultBrandElements,
      ...(partial.brand_elements || {})
    },
    technical_quality: partial.technical_quality,
    raw_description: partial.raw_description
  };
}

/**
 * Normalize a single product entry
 */
function normalizeProduct(p: any): DetectedProduct {
  return {
    name: p.name || "Unknown product",
    category: p.category || "other",
    visual_features: Array.isArray(p.visual_features) ? p.visual_features : [],
    prominence: ["high", "medium", "low"].includes(p.prominence) ? p.prominence : "medium",
    confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.5
  };
}

/**
 * Create fallback result on error
 */
function createFallbackResult(errorMessage: string): VisionAnalysisResult {
  return {
    visual_style: {
      dominant_colors: [],
      photography_style: "unknown",
      lighting: "unknown",
      mood: "unknown",
      composition_patterns: []
    },
    products: [],
    brand_elements: {
      logo_visible: false,
      brand_colors_present: false,
      text_overlay: null
    },
    raw_description: `Analysis failed: ${errorMessage}`
  };
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  analyzeImage,
  analyzeInstagramPost,
  detectProducts,
  extractBrandStyle,
  analyzeImageBatch
};
