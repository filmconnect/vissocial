import { config } from "./config";

export async function falGenerateImage(params: { prompt: string; image_urls?: string[]; negative_prompt?: string }) {
  const res = await fetch(`https://fal.run/fal-ai/${config.falFluxModel}`, {
    method:"POST",
    headers:{ "Authorization": `Key ${config.falKey}`, "Content-Type":"application/json" },
    body: JSON.stringify({ prompt: params.prompt, image_urls: params.image_urls ?? [], negative_prompt: params.negative_prompt })
  });
  if(!res.ok) throw new Error(`fal.ai error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data?.images?.[0]?.url || data?.image?.url || data?.url;
  if(!url) throw new Error("fal.ai response missing url");
  return { url, raw: data };
}
