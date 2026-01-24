import { q } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { falGenerateImage } from "@/lib/fal";

async function gatherRefs(project_id: string) {
  const rows = await q<any>(`SELECT url, label FROM assets WHERE project_id=$1 AND label IN ('style_reference','product_reference','character_reference') ORDER BY created_at DESC LIMIT 8`, [project_id]);
  return rows.map(r=>r.url);
}

export async function renderFlux(data: { content_item_id: string; prompt: string; negative_prompt?: string; image_urls?: string[] }) {
  const { content_item_id, prompt, negative_prompt } = data;
  const renderId = "rnd_" + uuid();
  await q(`INSERT INTO renders(id, content_item_id, status) VALUES ($1,$2,'running')`, [renderId, content_item_id]);

  const item = (await q<any>(`SELECT project_id FROM content_items WHERE id=$1`, [content_item_id]))[0];
  const refs = data.image_urls?.length ? data.image_urls : (item?.project_id ? await gatherRefs(item.project_id) : []);

  try {
    const out = await falGenerateImage({ prompt, image_urls: refs, negative_prompt });
    await q(`UPDATE renders SET status='succeeded', outputs=$1, updated_at=now() WHERE id=$2`,
      [JSON.stringify({ url: out.url, refs }), renderId]);
    return { url: out.url };
  } catch (e: any) {
    await q(`UPDATE renders SET status='failed', outputs=$1, updated_at=now() WHERE id=$2`,
      [JSON.stringify({ error: e.message }), renderId]);
    throw e;
  }
}
