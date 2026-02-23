// ============================================================
// renderFlux.ts — Image rendering via fal.ai
// ============================================================
// V9: Hard cap of 4 image_urls (fal.ai FLUX.2 edit limit)
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
import { log, logError } from "@/lib/logger";

// ============================================================
// Constants
// ============================================================

/** fal.ai FLUX.2 edit API hard limit */
const FAL_MAX_IMAGE_URLS = 4;

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

const CREATIVE_SCENES = [
  "on a rustic wooden table in a cozy coffee shop with warm bokeh lights and a latte art cup nearby, intimate afternoon atmosphere",
  "resting on a marble countertop in a bright modern kitchen, fresh herbs and citrus fruits artfully scattered, morning sunlight streaming through the window",
  "displayed on a sleek wooden desk next to a monstera plant, minimalist Scandinavian interior, large window with forest view, natural diffused light",
  "placed on a velvet cushion atop vintage books in a library setting, warm golden reading lamp light, rich mahogany shelves in soft focus behind",
  "floating on a bed of fresh flower petals — roses, peonies, lavender — shot from above, soft pastel tones, dreamy flatlay composition",
  "set on a sandy beach at sunset, gentle waves in the background, warm golden hour light casting long shadows, tropical paradise mood",
  "balanced on a mossy rock in an enchanted forest, dappled sunlight through tall trees, ferns and tiny mushrooms in foreground, magical atmosphere",
  "positioned on a clean white bed with rumpled linen sheets and soft pillows, morning light through sheer curtains, minimal luxe lifestyle",
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
// Prioritize and cap references to FAL_MAX_IMAGE_URLS
// ============================================================
// Priority order:
//   1. First product_reference (hero product — most important)
//   2. First style_reference (aesthetic matching)
//   3. First character_reference (person consistency)
//   4. Fill remaining slot(s) from extras in same priority order
// ============================================================

function prioritizeRefs(ordered: RefImage[]): RefImage[] {
  const products = ordered.filter(r => r.label === "product_reference");
  const styles = ordered.filter(r => r.label === "style_reference");
  const characters = ordered.filter(r => r.label === "character_reference");

  const selected: RefImage[] = [];

  // Round 1: first of each type
  if (products.length > 0) selected.push(products[0]);
  if (styles.length > 0 && selected.length < FAL_MAX_IMAGE_URLS) selected.push(styles[0]);
  if (characters.length > 0 && selected.length < FAL_MAX_IMAGE_URLS) selected.push(characters[0]);

  // Round 2: fill remaining slots with extras (second style, second character, etc.)
  const extras = [
    ...styles.slice(1),
    ...characters.slice(1),
    ...products.slice(1),
  ];

  for (const ref of extras) {
    if (selected.length >= FAL_MAX_IMAGE_URLS) break;
    selected.push(ref);
  }

  return selected;
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
    // Explicit image_urls passed — still enforce cap
    imageUrls = data.image_urls.slice(0, FAL_MAX_IMAGE_URLS);
    smartPrompt = prompt;

    log("renderFlux", "using explicit image_urls", {
      content_item_id,
      num_refs: imageUrls.length,
      original_count: data.image_urls.length,
      capped: data.image_urls.length > FAL_MAX_IMAGE_URLS,
    });
  } else if (project_id) {
    const { grouped, ordered } = await gatherRefsGrouped(project_id);

    // ============================================================
    // FIX: Cap refs to FAL_MAX_IMAGE_URLS (4) with smart priority
    // Before: kept all style + character refs → could exceed 4
    // After: prioritize 1 product → 1 style → 1 character → fill remaining
    // ============================================================
    const limitedOrdered = prioritizeRefs(ordered);

    imageUrls = limitedOrdered.map(r => r.url);
    smartPrompt = buildSmartPrompt(prompt, grouped, limitedOrdered, content_item_id);

    log("renderFlux", "gathered refs from DB", {
      content_item_id,
      project_id,
      product_refs: grouped.product.length,
      style_refs: grouped.style.length,
      character_refs: grouped.character.length,
      total_available: ordered.length,
      refs_used: limitedOrdered.length,
      ref_labels: limitedOrdered.map(r => r.label),
      fal_max: FAL_MAX_IMAGE_URLS,
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
          num_refs: imageUrls.length,
          smart_prompt: smartPrompt,
          original_prompt: prompt,
        }),
        renderId,
      ]
    );

    logError("renderFlux", "render failed", e, {
      content_item_id,
      renderId,
      num_refs: imageUrls.length,
    });

    throw e;
  }
}
