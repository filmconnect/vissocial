import { q } from "@/lib/db";
import { config } from "@/lib/config";
import { createMediaContainer, publishMedia } from "@/lib/instagram";
import { qMetrics } from "@/lib/jobs";
import { log } from "@/lib/logger";

function extractUrl(outputs: any): string | null {
  try { const o = typeof outputs === "string" ? JSON.parse(outputs) : outputs; return o?.url ?? null; } catch { return null; }
}

export async function publishInstagram(data: { content_item_id: string }) {
  const row = (await q<any>(`
    SELECT ci.*, p.meta_access_token, p.ig_user_id, p.ig_publish_enabled
    FROM content_items ci JOIN projects p ON ci.project_id=p.id
    WHERE ci.id=$1`, [data.content_item_id]))[0];
  if (!row) return { ok: false, error: "item_not_found" };

  if (!config.enableInstagramPublish || !row.ig_publish_enabled) return { ok: false, error: "publishing_disabled" };
  if (!row.meta_access_token || !row.ig_user_id) return { ok: false, error: "missing_token_or_ig_user_id" };

  const render = (await q<any>(`SELECT outputs FROM renders WHERE content_item_id=$1 AND status='succeeded' ORDER BY updated_at DESC LIMIT 1`, [row.id]))[0];
  const image_url = extractUrl(render?.outputs);
  if (!image_url) return { ok: false, error: "no_render" };

  try {
    const container = await createMediaContainer(row.ig_user_id, row.meta_access_token, { image_url, caption: row.caption?.long ?? "", media_type: "IMAGE" });
    const creation_id = container.id;
    const pub = await publishMedia(row.ig_user_id, row.meta_access_token, creation_id);
    const ig_media_id = pub.id;

    await q(`UPDATE content_items SET ig_creation_id=$1, ig_media_id=$2, publish_status='published', published_at=now() WHERE id=$3`,
      [creation_id, ig_media_id, row.id]);

    await qMetrics.add("metrics.ingest", { project_id: row.project_id, window: "1h" }, { delay: 60 * 60 * 1000 });
    await qMetrics.add("metrics.ingest", { project_id: row.project_id, window: "24h" }, { delay: 24 * 60 * 60 * 1000 });
    await qMetrics.add("metrics.ingest", { project_id: row.project_id, window: "7d" }, { delay: 7 * 24 * 60 * 60 * 1000 });

    return { ok: true, ig_media_id };
  } catch (e: any) {
    log("publishInstagram", "failed", { err: e.message });
    await q(`UPDATE content_items SET publish_status='failed' WHERE id=$1`, [row.id]);
    return { ok: false, error: e.message };
  }
}
