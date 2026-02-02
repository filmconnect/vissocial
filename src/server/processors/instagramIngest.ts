// ============================================================
// INSTAGRAM INGEST PROCESSOR (PATCHED WITH NOTIFICATIONS)
// ============================================================
// Povlači media s Instagrama, sprema u MinIO i assets tablicu.
// UPDATED: Trigira Vision analizu + šalje notifikacije u chat.
// ============================================================

import { q } from "@/lib/db";
import { graphGET } from "@/lib/instagram";
import { downloadToBuffer, putObject } from "@/lib/storage";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { qAnalyze } from "@/lib/jobs";
import { config } from "@/lib/config";
import { makePublicUrl } from "@/lib/makePublicUrl";
import { notify } from "@/lib/notifications";

// ============================================================
// TYPES
// ============================================================

export interface InstagramIngestInput {
  project_id: string;
  limit?: number;
  skip_analysis?: boolean;
}

export interface InstagramIngestResult {
  ok: boolean;
  stored: number;
  skipped: number;
  analysis_queued: number;
  event_id?: string;
  reason?: string;
}

// ============================================================
// MAIN PROCESSOR
// ============================================================

export async function instagramIngest(
  data: InstagramIngestInput
): Promise<InstagramIngestResult> {
  
  const startTime = Date.now();
  const { project_id, limit = 25, skip_analysis = false } = data;

  log("instagramIngest", "start", {
    project_id,
    limit,
    skip_analysis
  });

  // =========================================================
  // 1. Dohvati projekt i provjeri token
  // =========================================================
  const project = (await q<any>(
    `SELECT * FROM projects WHERE id = $1`,
    [project_id]
  ))[0];

  if (!project?.meta_access_token || !project?.ig_user_id) {
    log("instagramIngest", "missing_credentials", { project_id });
    return {
      ok: false,
      stored: 0,
      skipped: 0,
      analysis_queued: 0,
      reason: "missing_token_or_ig_user_id"
    };
  }

  // =========================================================
  // 2. Dohvati media s Instagram Graph API
  // =========================================================
  let media;
  try {
    media = await graphGET(
      `/${project.ig_user_id}/media`,
      project.meta_access_token,
      {
        fields: "id,media_type,media_url,thumbnail_url,permalink,timestamp,caption",
        limit: limit.toString()
      }
    );
  } catch (error: any) {
    log("instagramIngest", "graph_api_error", {
      project_id,
      error: error.message
    });
    
    // Notify about failure
    await notify.jobFailed(project_id, "instagram.ingest", error.message);
    
    return {
      ok: false,
      stored: 0,
      skipped: 0,
      analysis_queued: 0,
      reason: "instagram_api_error: " + error.message
    };
  }

  const mediaItems = media?.data ?? [];

  if (mediaItems.length === 0) {
    log("instagramIngest", "no_media", { project_id });
    return {
      ok: true,
      stored: 0,
      skipped: 0,
      analysis_queued: 0,
      reason: "no_media_found"
    };
  }

  // =========================================================
  // 3. Create rebuild event for tracking
  // =========================================================
  const eventId = "evt_" + uuid();
  await q(
    `INSERT INTO brand_rebuild_events (id, project_id, trigger_type, total_expected, status)
     VALUES ($1, $2, 'instagram_ingest', $3, 'analyzing')`,
    [eventId, project_id, mediaItems.length]
  );

  // =========================================================
  // 4. Process each media item
  // =========================================================
  let stored = 0;
  let skipped = 0;
  let analysisQueued = 0;

  for (const item of mediaItems) {
    try {
      // Skip if already exists
      const existing = await q<any>(
        `SELECT id FROM assets WHERE external_id = $1 AND project_id = $2`,
        [item.id, project_id]
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Get image URL (use thumbnail for videos)
      const imageUrl = item.media_type === "VIDEO" 
        ? item.thumbnail_url 
        : item.media_url;

      if (!imageUrl) {
        log("instagramIngest", "no_image_url", { 
          item_id: item.id, 
          media_type: item.media_type 
        });
        skipped++;
        continue;
      }

// Download and upload to MinIO
const buffer = await downloadToBuffer(imageUrl);
const ext = imageUrl.includes(".png") ? "png" : "jpg";
const key = `instagram/${project_id}/${item.id}.${ext}`;

await putObject(key, buffer, `image/${ext === "png" ? "png" : "jpeg"}`);
const publicUrl = makePublicUrl(key);

// Map Instagram media type to asset.type
const assetType =
  item.media_type === "VIDEO" ? "video" : "image";

// Save to database
const assetId = "asset_" + uuid();
await q(
  `INSERT INTO assets (
     id,
     project_id,
     type,
     external_id,
     source,
     url,
     metadata,
     created_at
   )
   VALUES ($1, $2, $3, $4, 'instagram', $5, $6, $7)`,
  [
    assetId,
    project_id,
    assetType,
    item.id,
    publicUrl,
    JSON.stringify({
      media_type: item.media_type,
      permalink: item.permalink,
      caption: item.caption,
      timestamp: item.timestamp
    }),
    item.timestamp || new Date().toISOString()
  ]
);

stored++;


      // Queue analysis if not skipped
      if (!skip_analysis) {
        await qAnalyze.add("analyze.instagram", {
          asset_id: assetId,
          project_id,
          image_url: publicUrl,
          caption: item.caption,
          rebuild_event_id: eventId
        });
        analysisQueued++;
      }

    } catch (error: any) {
      log("instagramIngest", "item_error", {
        item_id: item.id,
        error: error.message
      });
      skipped++;
    }
  }

  // =========================================================
  // 5. Update event status
  // =========================================================
  await q(
    `UPDATE brand_rebuild_events 
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1`,
    [eventId]
  );

  // =========================================================
  // 6. SEND NOTIFICATION TO CHAT
  // =========================================================
  if (stored > 0) {
    await notify.ingestComplete(project_id, stored);
  }

  log("instagramIngest", "completed", {
    project_id,
    stored,
    skipped,
    analysis_queued: analysisQueued,
    duration_ms: Date.now() - startTime
  });

  return {
    ok: true,
    stored,
    skipped,
    analysis_queued: analysisQueued,
    event_id: eventId
  };
}
