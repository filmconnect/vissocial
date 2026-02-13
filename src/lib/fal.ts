// ============================================================
// fal.ts — fal.ai Image Generation with Smart Model Routing
// ============================================================
// V8: Separate text-to-image vs image-edit pipelines
//
// - No references → text-to-image (flux/dev or configured model)
// - With references → edit model (flux-2/edit) with @image indexing
// ============================================================

import { config } from "./config";
import { log } from "./logger";

// ============================================================
// Types
// ============================================================

export interface FalGenerateParams {
  prompt: string;
  image_urls?: string[];
  negative_prompt?: string;
}

export interface FalEditParams {
  prompt: string;
  image_urls: string[];
  negative_prompt?: string;
}

export interface FalResult {
  url: string;
  raw: any;
  model_used: string;
}

// ============================================================
// Reference-aware image generation (smart router)
// ============================================================
// This is the main entry point. It decides which model to call:
// - No image_urls → text-to-image (falFluxModel)
// - With image_urls → edit model (falFluxEditModel)
// ============================================================

export async function falGenerateImage(params: FalGenerateParams): Promise<FalResult> {
  const hasRefs = params.image_urls && params.image_urls.length > 0;

  if (hasRefs) {
    return falEditImage({
      prompt: params.prompt,
      image_urls: params.image_urls!,
      negative_prompt: params.negative_prompt,
    });
  }

  return falTextToImage(params);
}

// ============================================================
// Text-to-image (no references)
// ============================================================

async function falTextToImage(params: FalGenerateParams): Promise<FalResult> {
  const model = config.falFluxModel;
  const url = `https://fal.run/fal-ai/${model}`;

  log("fal", "text-to-image request", {
    model,
    prompt_length: params.prompt.length,
  });

  const body: Record<string, any> = {
    prompt: params.prompt,
  };

  if (params.negative_prompt) {
    body.negative_prompt = params.negative_prompt;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Key ${config.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    log("fal", "text-to-image error", { status: res.status, error: errText });
    throw new Error(`fal.ai text-to-image error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const imageUrl = extractImageUrl(data);

  log("fal", "text-to-image success", { model, url: imageUrl });

  return { url: imageUrl, raw: data, model_used: model };
}

// ============================================================
// Image edit with references (FLUX.2 edit)
// ============================================================
// FLUX.2 edit API format:
// {
//   prompt: "Place the product from @image1 on a kitchen counter",
//   image_urls: ["https://...product.jpg", "https://...style.jpg"]
// }
// ============================================================

async function falEditImage(params: FalEditParams): Promise<FalResult> {
  const model = config.falFluxEditModel;
  const url = `https://fal.run/fal-ai/${model}`;

  log("fal", "edit request", {
    model,
    prompt_length: params.prompt.length,
    num_refs: params.image_urls.length,
    ref_urls: params.image_urls,
  });

  const body: Record<string, any> = {
    prompt: params.prompt,
    image_urls: params.image_urls,
  };

  if (params.negative_prompt) {
    body.negative_prompt = params.negative_prompt;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Key ${config.falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    log("fal", "edit error", { status: res.status, error: errText });
    throw new Error(`fal.ai edit error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const imageUrl = extractImageUrl(data);

  log("fal", "edit success", {
    model,
    url: imageUrl,
    num_refs: params.image_urls.length,
  });

  return { url: imageUrl, raw: data, model_used: model };
}

// ============================================================
// Extract image URL from fal.ai response (various formats)
// ============================================================

function extractImageUrl(data: any): string {
  const url =
    data?.images?.[0]?.url ||
    data?.image?.url ||
    data?.url;

  if (!url) {
    throw new Error("fal.ai response missing image url: " + JSON.stringify(data).substring(0, 200));
  }

  return url;
}
