// ============================================================
// fal.ts â€” fal.ai Image Generation with Smart Model Routing
// ============================================================
// V9: Enhanced production logging with timing and error details
// ============================================================

import { config } from "./config";
import { log, logError } from "./logger";

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

export async function falGenerateImage(params: FalGenerateParams): Promise<FalResult> {
  const hasRefs = params.image_urls && params.image_urls.length > 0;

  log("fal", "router decision", {
    has_refs: hasRefs,
    num_refs: params.image_urls?.length || 0,
    prompt_length: params.prompt.length,
  });

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
  const startTime = Date.now();

  log("fal", "text-to-image request", {
    model,
    url,
    prompt_length: params.prompt.length,
    prompt_preview: params.prompt.substring(0, 150),
    has_fal_key: !!config.falKey,
    fal_key_prefix: config.falKey?.substring(0, 8) + "...",
  });

  const body: Record<string, any> = {
    prompt: params.prompt,
  };

  if (params.negative_prompt) {
    body.negative_prompt = params.negative_prompt;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Key ${config.falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (fetchError: any) {
    const duration = Date.now() - startTime;
    logError("fal", "text-to-image FETCH error (network)", fetchError, {
      model,
      duration_ms: duration,
    });
    throw fetchError;
  }

  const duration = Date.now() - startTime;

  if (!res.ok) {
    const errText = await res.text();
    logError("fal", "text-to-image API error", { message: `${res.status}: ${errText}` }, {
      model,
      status: res.status,
      duration_ms: duration,
      error_body: errText.substring(0, 500),
    });
    throw new Error(`fal.ai text-to-image error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const imageUrl = extractImageUrl(data);

  log("fal", "text-to-image success", {
    model,
    url: imageUrl,
    duration_ms: duration,
  });

  return { url: imageUrl, raw: data, model_used: model };
}

// ============================================================
// Image edit with references (FLUX.2 edit)
// ============================================================

async function falEditImage(params: FalEditParams): Promise<FalResult> {
  const model = config.falFluxEditModel;
  const url = `https://fal.run/fal-ai/${model}`;
  const startTime = Date.now();

  log("fal", "edit request", {
    model,
    url,
    prompt_length: params.prompt.length,
    prompt_preview: params.prompt.substring(0, 150),
    num_refs: params.image_urls.length,
    ref_urls: params.image_urls.map(u => u.substring(0, 80)),
    has_fal_key: !!config.falKey,
  });

  const body: Record<string, any> = {
    prompt: params.prompt,
    image_urls: params.image_urls,
    enable_safety_checker: false,
  };

  if (params.negative_prompt) {
    body.negative_prompt = params.negative_prompt;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Key ${config.falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (fetchError: any) {
    const duration = Date.now() - startTime;
    logError("fal", "edit FETCH error (network)", fetchError, {
      model,
      duration_ms: duration,
      num_refs: params.image_urls.length,
    });
    throw fetchError;
  }

  const duration = Date.now() - startTime;

  if (!res.ok) {
    const errText = await res.text();
    logError("fal", "edit API error", { message: `${res.status}: ${errText}` }, {
      model,
      status: res.status,
      duration_ms: duration,
      error_body: errText.substring(0, 500),
      num_refs: params.image_urls.length,
    });
    throw new Error(`fal.ai edit error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const imageUrl = extractImageUrl(data);

  log("fal", "edit success", {
    model,
    url: imageUrl,
    duration_ms: duration,
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
    logError("fal", "response missing image url", {
      message: "No url found in response",
    }, {
      response_keys: data ? Object.keys(data) : null,
      response_preview: JSON.stringify(data).substring(0, 300),
    });
    throw new Error("fal.ai response missing image url: " + JSON.stringify(data).substring(0, 200));
  }

  return url;
}

