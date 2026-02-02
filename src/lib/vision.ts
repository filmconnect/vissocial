// ============================================================
// VISION.TS - GPT-4 Vision API (URL ONLY - NO BASE64!)
// ============================================================

import { config } from "@/lib/config";
import { log } from "@/lib/logger";

// ============================================================
// TYPES
// ============================================================

export interface VisualStyle {
  dominant_colors: string[];
  photography_style: string;
  lighting: string;
  mood: string;
  composition_patterns: string[];
}

export interface DetectedProduct {
  name: string;
  category: string;
  visual_features: string[];
  prominence: "high" | "medium" | "low";
  confidence: number;
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
  brand_style: `You are a visual brand analyst. Analyze the image for brand visual style.
Return ONLY valid JSON with this structure:
{
  "visual_style": {
    "dominant_colors": ["#HEX1", "#HEX2", "#HEX3"],
    "photography_style": "lifestyle|studio|flat_lay|product_focus|outdoor|portrait",
    "lighting": "natural|studio|golden_hour|soft|dramatic",
    "mood": "cozy|professional|playful|minimal|luxurious|energetic",
    "composition_patterns": ["rule_of_thirds", "centered", "symmetrical"]
  },
  "products": [],
  "brand_elements": {
    "logo_visible": false,
    "brand_colors_present": true,
    "text_overlay": null
  }
}
Identify the 3-5 most dominant colors.
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
// MAIN FUNCTION: analyzeImage (URL ONLY!)
// ============================================================

export async function analyzeImage(
  imageUrl: string,
  analysisType: AnalysisType = "full_analysis",
  additionalContext?: string
): Promise<VisionAnalysisResult> {
  
  const startTime = Date.now();
  
  log("vision", "analyzeImage:start", {
    imageUrl: imageUrl.substring(0, 80) + "...",
    type: analysisType,
    hasContext: !!additionalContext
  });

  const systemPrompt = SYSTEM_PROMPTS[analysisType];
  
  // ✅ ŠALJE URL DIREKTNO - NEMA BASE64!
  const userContent: any[] = [
    {
      type: "image_url",
      image_url: {
        url: imageUrl,  // ← DIREKTAN URL
        detail: "high"
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
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" },
        max_tokens: 2000,
        temperature: 0.3
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

    let analysis: Partial<VisionAnalysisResult>;
    try {
      analysis = JSON.parse(content);
    } catch (parseError) {
      log("vision", "analyzeImage:parse_error", {
        content: content.substring(0, 200)
      });
      throw new Error("Failed to parse Vision API response as JSON");
    }

    const result = normalizeAnalysisResult(analysis, analysisType);
    
    const duration = Date.now() - startTime;
    const tokensUsed = data.usage?.total_tokens || 0;
    
    log("vision", "analyzeImage:success", {
      duration_ms: duration,
      tokens_used: tokensUsed,
      products_found: result.products.length
    });

    return result;

  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    log("vision", "analyzeImage:error", {
      duration_ms: duration,
      error: error.message
    });

    return createFallbackResult(error.message);
  }
}

// ============================================================
// WRAPPERS
// ============================================================

export async function analyzeInstagramPost(
  imageUrl: string,
  caption?: string
): Promise<VisionAnalysisResult> {
  return analyzeImage(imageUrl, "full_analysis", caption);
}

export async function detectProducts(
  imageUrl: string
): Promise<DetectedProduct[]> {
  const result = await analyzeImage(imageUrl, "product_detection");
  return result.products;
}

export async function extractBrandStyle(
  imageUrl: string
): Promise<VisualStyle> {
  const result = await analyzeImage(imageUrl, "brand_style");
  return result.visual_style;
}

// ============================================================
// BATCH ANALYSIS
// ============================================================

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

    if (i + concurrency < images.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

// ============================================================
// HELPERS
// ============================================================

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

function normalizeProduct(p: any): DetectedProduct {
  return {
    name: p.name || "Unknown product",
    category: p.category || "other",
    visual_features: Array.isArray(p.visual_features) ? p.visual_features : [],
    prominence: ["high", "medium", "low"].includes(p.prominence) ? p.prominence : "medium",
    confidence: typeof p.confidence === "number" ? Math.max(0, Math.min(1, p.confidence)) : 0.5
  };
}

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

export default {
  analyzeImage,
  analyzeInstagramPost,
  detectProducts,
  extractBrandStyle,
  analyzeImageBatch
};
