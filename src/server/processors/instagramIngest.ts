import { q } from "@/lib/db";
import { graphGET } from "@/lib/instagram";
import { downloadToBuffer, putObject } from "@/lib/storage";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";

export async function instagramIngest(data: { project_id: string }) {
  const project = (await q<any>(`SELECT * FROM projects WHERE id=$1`, [data.project_id]))[0];
  if (!project?.meta_access_token || !project?.ig_user_id) {
    log("instagramIngest", "Missing token or ig_user_id", { project_id: data.project_id });
    return { ok: false, reason: "missing_token_or_ig_user_id" };
  }

  const media = await graphGET(`/${project.ig_user_id}/media`, project.meta_access_token, {
    fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp,caption",
    limit: "25"
  });

  let stored = 0;
  for (const m of (media?.data ?? [])) {
    const url = m.media_url || m.thumbnail_url;
    if (!url) continue;
    try {
      const buf = await downloadToBuffer(url);
      const ext = m.media_type === "VIDEO" ? "mp4" : "jpg";
      const key = `ig/${project.id}/${m.id}.${ext}`;
      const uploadedUrl = await putObject(key, buf, m.media_type === "VIDEO" ? "video/mp4" : "image/jpeg");
      await q(
        `INSERT INTO assets(id, project_id, type, source, url, label, metadata)
         VALUES ($1,$2,$3,'instagram',$4,'ig_media',$5)`,
        ["asset_" + uuid(), project.id, m.media_type === "VIDEO" ? "video" : "image", uploadedUrl, JSON.stringify(m)]
      );
      stored += 1;
    } catch (e: any) {
      log("instagramIngest", "download/upload failed", { media_id: m.id, err: e.message });
    }
  }

  await q(
    `UPDATE brand_profiles SET profile = COALESCE(profile,'{}'::jsonb) || $1::jsonb WHERE project_id=$2`,
    [JSON.stringify({ ingest: { ig_media_count: media?.data?.length ?? 0, last_ingest: new Date().toISOString() } }), project.id]
  );

  return { ok: true, stored };
}
