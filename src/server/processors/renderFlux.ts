// ============================================================
// renderFlux.ts — Image rendering via fal.ai
// ============================================================
// V8: Smart reference routing
//
// Reference types and how they're used:
//
// product_reference → Product placed in new context
//   Prompt: "The product from @image1 displayed in [scene from content prompt]"
//   The product should look identical, only the environment changes.
//
// style_reference → Visual style transfer
//   Prompt: "[content prompt] in the visual style of @image1"
//   Generate new content but matching the aesthetic/mood of the ref.
//
// character_reference → Person/mascot consistency
//   Prompt: "The person from @image1 [doing action from content prompt]"
//   Keep the character looking the same across different scenes.
//
// mixed → Multiple types combined
//   Prompt: "The product from @image1, in the style of @image2, ..."
//   References indexed in order: products first, then style, then character.
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
// The original prompt from planGenerate describes the desired scene.
// We wrap it with @image references so FLUX.2 edit knows how to use them.
// ============================================================

function buildSmartPrompt(
  originalPrompt: string,
  grouped: GroupedRefs,
  orderedRefs: RefImage[]
): string {
  // No references — return original prompt as-is
  if (orderedRefs.length === 0) {
    return originalPrompt;
  }

  const parts: string[] = [];

  // Track which @imageN index each ref gets
  // Images are indexed 1-based in the order they appear in image_urls
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
  // "Place the product from @image1 in [scene]"
  if (productIndices.length > 0) {
    if (productIndices.length === 1) {
      parts.push(`Place the product from @image${productIndices[0]} in the following scene`);
    } else {
      const refs = productIndices.map(i => `@image${i}`).join(" and ");
      parts.push(`Place the products from ${refs} in the following scene`);
    }
  }

  // === CHARACTER REFERENCES ===
  // "The person/character from @image2 is featured in the scene"
  if (characterIndices.length > 0) {
    if (characterIndices.length === 1) {
      parts.push(`The person or character from @image${characterIndices[0]} should appear in the scene`);
    } else {
      const refs = characterIndices.map(i => `@image${i}`).join(" and ");
      parts.push(`The people/characters from ${refs} should appear in the scene`);
    }
  }

  // === STYLE REFERENCES ===
  // "Match the visual style, lighting, and mood of @image3"
  if (styleIndices.length > 0) {
    if (styleIndices.length === 1) {
      parts.push(`Match the visual style, lighting, color palette, and mood of @image${styleIndices[0]}`);
    } else {
      const refs = styleIndices.map(i => `@image${i}`).join(" and ");
      parts.push(`Match the visual style and aesthetic from ${refs}`);
    }
  }

  // === Combine ===
  // Format: "[reference instructions]. Scene: [original prompt]"
  const refInstructions = parts.join(". ");
  const finalPrompt = `${refInstructions}. Scene description: ${originalPrompt}`;

  return finalPrompt;
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

  // Create render record
  await q(
    `INSERT INTO renders(id, content_item_id, status) VALUES ($1, $2, 'running')`,
    [renderId, content_item_id]
  );

  // Get project_id from content item
  const item = (await q<any>(
    `SELECT project_id FROM content_items WHERE id = $1`,
    [content_item_id]
  ))[0];

  const project_id = item?.project_id;

  // Determine references
  let imageUrls: string[] = [];
  let smartPrompt = prompt;

  if (data.image_urls && data.image_urls.length > 0) {
    // Explicit image_urls passed (e.g., from manual override)
    imageUrls = data.image_urls;
    smartPrompt = prompt; // Use prompt as-is when explicitly provided

    log("renderFlux", "using explicit image_urls", {
      content_item_id,
      num_refs: imageUrls.length,
    });
  } else if (project_id) {
    // Gather refs from DB and build smart prompt
    const { grouped, ordered } = await gatherRefsGrouped(project_id);
    imageUrls = ordered.map(r => r.url);
    smartPrompt = buildSmartPrompt(prompt, grouped, ordered);

    log("renderFlux", "gathered refs from DB", {
      content_item_id,
      project_id,
      product_refs: grouped.product.length,
      style_refs: grouped.style.length,
      character_refs: grouped.character.length,
      total_refs: imageUrls.length,
      smart_prompt: smartPrompt.substring(0, 200),
    });
  }

  try {
    // falGenerateImage auto-routes:
    // - No imageUrls → text-to-image model
    // - With imageUrls → edit model (FLUX.2)
    const out = await falGenerateImage({
      prompt: smartPrompt,
      image_urls: imageUrls.length > 0 ? imageUrls : undefined,
      negative_prompt,
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
