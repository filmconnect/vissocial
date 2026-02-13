// ============================================================
// renderFlux.ts — Image rendering via fal.ai
// ============================================================
// V8: Smart reference routing
//
// Reference types and how they're used:
//
// product_reference → Product placed in new context
//   The product (book cover, packaging, etc.) must be IDENTICAL.
//   Only the environment/scene changes — creative, Instagram-worthy.
//
// style_reference → Visual style transfer
//   Generate new content matching the aesthetic/mood of the ref.
//
// character_reference → Person/mascot consistency
//   Keep the character looking the same across different scenes.
// ============================================================

import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { falGenerateImage } from "@/lib/fal";
import { log } from "@/lib/logger";

// ============================================================
// Types
// ============================================================

interface RefImage {
  url: string;
  label: string;
}

interface GroupedRefs {
  product: string[];
  style: string[];
  character: string[];
}

// ============================================================
// Creative environment scenes for Instagram
// ============================================================
// Each scene is a visually appealing, Instagram-worthy setting.
// The product gets placed into these scenes as the hero subject.
// Deterministic per content_item_id so re-renders are consistent.
// ============================================================

const CREATIVE_SCENES = [
  "on a rustic wooden café table in a cozy European coffee shop, warm morning light streaming through the window, latte art coffee cup nearby, bokeh background",
  "held in someone's hand on a sunlit balcony overlooking a Mediterranean coastal town, lush green hills and terracotta rooftops in the background, golden hour lighting",
  "resting on a marble countertop in a stylish modern apartment, large window showing a cityscape of Zagreb at sunset, soft natural lighting",
  "placed on weathered stone steps in a charming London side street, red brick buildings and autumn leaves in the background, moody atmospheric lighting",
  "on a blanket in a sun-dappled park, cherry blossoms gently falling, soft pastel tones, dreamy shallow depth of field",
  "displayed on a sleek wooden desk next to a monstera plant, minimalist Scandinavian interior, large window with forest view, natural diffused light",
  "on an outdoor bistro table in Paris, Eiffel Tower softly blurred in the far background, morning croissant and espresso nearby, cinematic composition",
  "resting on a cozy window seat with rain drops on the glass, city lights twinkling outside at dusk, warm indoor lighting, hygge atmosphere",
  "placed on a vintage velvet armchair in a bohemian loft, exposed brick walls, string lights, plants hanging from ceiling, warm golden tones",
  "on a beach towel at a tropical seaside, turquoise water and white sand in background, palm leaf shadow casting artistic patterns, vibrant summer colors",
  "displayed on a floating wooden tray in a luxurious bathtub setting, candles and eucalyptus branches nearby, spa-like serene atmosphere",
  "held up against a dramatic mountain landscape at golden hour, alpine meadow with wildflowers, cinematic wide composition with shallow focus on the product",
  "on a wrought-iron garden table surrounded by blooming roses, English cottage garden in soft morning mist, romantic pastoral atmosphere",
  "centered on a polished concrete surface in a trendy gallery space, abstract art on walls in background, museum-quality directional lighting",
  "on an old wooden boat dock by a calm lake at sunrise, misty mountains reflected in still water, serene peaceful composition",
];

// Deterministic scene selection based on content_item_id
function getSceneForItem(content_item_id: string): string {
  let hash = 0;
  for (let i = 0; i < content_item_id.length; i++) {
    hash = ((hash << 5) - hash) + content_item_id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CREATIVE_SCENES.length;
  return CREATIVE_SCENES[index];
}

// ============================================================
// Gather references from DB, grouped by type
// ============================================================

async function gatherRefsGrouped(project_id: string): Promise<{ grouped: GroupedRefs; ordered: RefImage[] }> {
  const rows = await q<RefImage>(
    `SELECT url, label FROM assets
     WHERE project_id = $1
       AND label IN ('style_reference', 'product_reference', 'character_reference')
     ORDER BY
       CASE label
         WHEN 'product_reference' THEN 1
         WHEN 'style_reference' THEN 2
         WHEN 'character_reference' THEN 3
       END,
       created_at DESC
     LIMIT 8`,
    [project_id]
  );

  const grouped: GroupedRefs = {
    product: [],
    style: [],
    character: [],
  };

  for (const r of rows) {
    if (r.label === "product_reference") grouped.product.push(r.url);
    else if (r.label === "style_reference") grouped.style.push(r.url);
    else if (r.label === "character_reference") grouped.character.push(r.url);
  }

  return { grouped, ordered: rows };
}

// ============================================================
// Build smart prompt based on reference types
// ============================================================

function buildSmartPrompt(
  originalPrompt: string,
  grouped: GroupedRefs,
  orderedRefs: RefImage[],
  content_item_id: string
): string {
  if (orderedRefs.length === 0) {
    return originalPrompt;
  }

  const parts: string[] = [];

  // Track @imageN indices (1-based, matching image_urls array order)
  let imageIndex = 1;
  const productIndices: number[] = [];
  const styleIndices: number[] = [];
  const characterIndices: number[] = [];

  for (const ref of orderedRefs) {
    if (ref.label === "product_reference") productIndices.push(imageIndex);
    else if (ref.label === "style_reference") styleIndices.push(imageIndex);
    else if (ref.label === "character_reference") characterIndices.push(imageIndex);
    imageIndex++;
  }

  // === PRODUCT REFERENCES ===
  // Strict fidelity: product must be pixel-perfect identical
  // Only ONE product as hero subject — never multiple
  if (productIndices.length > 0) {
    const heroIdx = productIndices[0];
    const scene = getSceneForItem(content_item_id);

    parts.push(
      `CRITICAL: Reproduce the exact product from @image${heroIdx} with perfect fidelity — ` +
      `every detail, color, text, typography, logo, pattern, and design element must be identical ` +
      `to the original. Do NOT alter, simplify, reinterpret, or reimagine the product. ` +
      `Show ONLY this single product as the sole hero subject of the image. ` +
      `Place it ${scene}`
    );
  }

  // === CHARACTER REFERENCES ===
  if (characterIndices.length > 0) {
    const heroIdx = characterIndices[0];
    parts.push(
      `The person or character from @image${heroIdx} should appear in the scene, ` +
      `maintaining their exact appearance, face, and distinctive features`
    );
  }

  // === STYLE REFERENCES ===
  if (styleIndices.length > 0) {
    const heroIdx = styleIndices[0];
    parts.push(
      `Match the visual style, color grading, lighting mood, and overall aesthetic of @image${heroIdx}`
    );
  }

  // === Final assembly ===
  const refInstructions = parts.join(". ");

  if (productIndices.length > 0) {
    return (
      `${refInstructions}. ` +
      `Additional context from content plan: ${originalPrompt}. ` +
      `Photography style: premium product photography for Instagram feed, ` +
      `shallow depth of field, beautiful bokeh background, ` +
      `natural lighting, aesthetically pleasing composition, ` +
      `high-end editorial lifestyle feel, 4K quality, photorealistic.`
    );
  }

  // For style/character without product
  return (
    `${refInstructions}. ` +
    `Scene description: ${originalPrompt}. ` +
    `Style: Instagram-ready, visually stunning, professional photography, ` +
    `shallow depth of field, beautiful composition.`
  );
}

// ============================================================
// Main render function
// ============================================================

export async function renderFlux(data: {
  content_item_id: string;
  prompt: string;
  negative_prompt?: string;
  image_urls?: string[];
}) {
  const { content_item_id, prompt, negative_prompt } = data;
  const renderId = "rnd_" + uuid();

  await q(
    `INSERT INTO renders(id, content_item_id, status) VALUES ($1, $2, 'running')`,
    [renderId, content_item_id]
  );

  const item = (await q<any>(
    `SELECT project_id FROM content_items WHERE id = $1`,
    [content_item_id]
  ))[0];

  const project_id = item?.project_id;

  let imageUrls: string[] = [];
  let smartPrompt = prompt;

  if (data.image_urls && data.image_urls.length > 0) {
    imageUrls = data.image_urls;
    smartPrompt = prompt;

    log("renderFlux", "using explicit image_urls", {
      content_item_id,
      num_refs: imageUrls.length,
    });
  } else if (project_id) {
    const { grouped, ordered } = await gatherRefsGrouped(project_id);

    // Keep only FIRST product ref for single-product focus
    // Keep all style and character refs
    const limitedOrdered = ordered.filter((ref, idx) => {
      if (ref.label === "product_reference") {
        return ordered.findIndex(r => r.label === "product_reference") === idx;
      }
      return true;
    });

    imageUrls = limitedOrdered.map(r => r.url);
    smartPrompt = buildSmartPrompt(prompt, grouped, limitedOrdered, content_item_id);

    log("renderFlux", "gathered refs from DB", {
      content_item_id,
      project_id,
      product_refs: grouped.product.length,
      style_refs: grouped.style.length,
      character_refs: grouped.character.length,
      refs_used: limitedOrdered.length,
      smart_prompt: smartPrompt.substring(0, 300),
    });
  }

  // Negative prompt optimized for product photography
  const defaultNegative =
    "blurry, low quality, distorted, deformed, ugly, disfigured, " +
    "multiple products, duplicate items, collage, grid, split image, " +
    "text overlay, watermark, logo overlay, " +
    "plain white background, studio background only, boring flat background, " +
    "altered product design, wrong colors on product, simplified product, " +
    "cartoon, illustration, painting, sketch, 3d render";

  const finalNegative = negative_prompt
    ? `${negative_prompt}, ${defaultNegative}`
    : defaultNegative;

  try {
    const out = await falGenerateImage({
      prompt: smartPrompt,
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
      negative_prompt: finalNegative,
    });

    await q(
      `UPDATE renders SET status = 'succeeded', outputs = $1, updated_at = now() WHERE id = $2`,
      [
        JSON.stringify({
          url: out.url,
          model_used: out.model_used,
          refs: imageUrls,
          smart_prompt: smartPrompt,
          original_prompt: prompt,
        }),
        renderId,
      ]
    );

    log("renderFlux", "render succeeded", {
      content_item_id,
      renderId,
      model_used: out.model_used,
      url: out.url,
    });

    return { url: out.url };
  } catch (e: any) {
    await q(
      `UPDATE renders SET status = 'failed', outputs = $1, updated_at = now() WHERE id = $2`,
      [
        JSON.stringify({
          error: e.message,
          refs: imageUrls,
          smart_prompt: smartPrompt,
          original_prompt: prompt,
        }),
        renderId,
      ]
    );

    log("renderFlux", "render failed", {
      content_item_id,
      renderId,
      error: e.message,
    });

    throw e;
  }
}
