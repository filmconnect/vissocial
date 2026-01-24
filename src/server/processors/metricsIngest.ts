import { q } from "@/lib/db";
import { getMediaInsights } from "@/lib/instagram";
import { updateArm } from "@/lib/policyClient";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)); }

function computeReward(metrics: any) {
  const reach = Number(metrics.reach || 0) || 0;
  const likes = Number(metrics.likes || 0) || 0;
  const comments = Number(metrics.comments || 0) || 0;
  const saves = Number(metrics.saves || 0) || 0;
  const shares = Number(metrics.shares || 0) || 0;
  if (reach <= 0) return 0.5;
  const eng = (likes + comments + saves + shares) / reach;
  return sigmoid((eng - 0.02) / 0.02);
}

export async function metricsIngest(data: { project_id: string; window: "1h" | "24h" | "7d" }) {
  const project = (await q<any>(`SELECT * FROM projects WHERE id=$1`, [data.project_id]))[0];
  if (!project?.meta_access_token) return { ok: false, error: "missing_token" };

  const items = await q<any>(`
    SELECT ci.id, ci.ig_media_id, cp.month, cf.arm_id
    FROM content_items ci
    JOIN content_packs cp ON ci.content_pack_id=cp.id
    LEFT JOIN content_features cf ON cf.content_item_id=ci.id
    WHERE ci.project_id=$1 AND ci.publish_status='published' AND ci.ig_media_id IS NOT NULL
    ORDER BY ci.published_at DESC
    LIMIT 25`, [data.project_id]);

  let updated = 0;

  for (const it of items) {
    try {
      const insights = await getMediaInsights(it.ig_media_id, project.meta_access_token, "reach,impressions,saved,shares,comments,likes");
      const map: any = {};
      for (const m of (insights?.data ?? [])) map[m.name] = m.values?.[0]?.value ?? m.value ?? null;

      const metrics = { reach: map.reach, impressions: map.impressions, saves: map.saved, shares: map.shares, comments: map.comments, likes: map.likes };
      const reward_01 = computeReward(metrics);

      await q(`INSERT INTO post_metrics(id, project_id, content_item_id, window, metrics, reward_01)
               VALUES ($1,$2,$3,$4,$5,$6)`,
        ["met_" + uuid(), data.project_id, it.id, data.window, JSON.stringify(metrics), reward_01]);

      if (it.arm_id) {
        await updateArm(data.project_id, it.month, it.arm_id, reward_01, { content_item_id: it.id, window: data.window });
      }
      updated += 1;
    } catch (e: any) {
      log("metricsIngest", "failed", { ig_media_id: it.ig_media_id, err: e.message });
    }
  }

  return { ok: true, updated };
}
