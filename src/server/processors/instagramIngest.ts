// ============================================================
// INSTAGRAM INGEST PROCESSOR (FIXED)
// ============================================================
// Povlači media s Instagrama, sprema u MinIO i assets tablicu.
//
// FIX: Proper URL generation for Vision API
// - Uses makePublicUrl from storageUrl.ts
// - Stores full HTTPS URL in assets.url
// - Passes correct URL to analyze job
// ============================================================

import { q } from "@/lib/db";
import { graphGET } from "@/lib/instagram";
import { downloadToBuffer, putObject } from "@/lib/storage";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { qAnalyze } from "@/lib/jobs";
import { makePublicUrl } from "@/lib/storageUrl";

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
    skip_analysis,
    APP_URL: process.env.APP_URL
  });

  // =========================================================
  // 1. Get project and check token
  // =========================================================
  
  const [project] = await q<any>(
    `SELECT * FROM projects WHERE id = $1`,
    [project_id]
  );

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
  // 2. Fetch media from Instagram Graph API
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

  log("instagramIngest", "media_fetched", {
    project_id,
    count: mediaItems.length
  });

  // =========================================================
  // 3. Create rebuild event for tracking
  // =========================================================
  
  const eventId = "evt_" + uuid();
  
  await q(
    `INSERT INTO brand_rebuild_events (
      id, project_id, trigger_type, status, 
      total_expected, analyses_completed
    )
    VALUES ($1, $2, 'instagram_ingest', 'analyzing', $3, 0)`,
    [eventId, project_id, mediaItems.length]
  );

  // =========================================================
  // 4. Process each media item
  // =========================================================
  
  let stored = 0;
  let skipped = 0;
  let analysisQueued = 0;

  for (const m of mediaItems) {
    try {
      // Check for duplicates by external_id
      const existing = await q<any>(
        `SELECT id FROM assets 
         WHERE project_id = $1 AND external_id = $2`,
        [project_id, m.id]
      );

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Get image URL (thumbnail for videos)
      const sourceUrl = m.media_type === "VIDEO" 
        ? m.thumbnail_url 
        : m.media_url;

      if (!sourceUrl) {
        log("instagramIngest", "no_source_url", { ig_id: m.id });
        skipped++;
        continue;
      }

      // Download image
      const buffer = await downloadToBuffer(sourceUrl);
      
      const isVideo = m.media_type === "VIDEO";
      const ext = isVideo ? "mp4" : "jpg";
      const contentType = isVideo ? "video/mp4" : "image/jpeg";
      
      // Upload to MinIO
      // Key format: ig/{project_id}/{ig_media_id}.{ext}
      const s3Key = `ig/${project_id}/${m.id}.${ext}`;
      
      const uploadedUrl = await putObject(s3Key, buffer, contentType);
      
      // CRITICAL: Convert to public HTTPS URL
      const publicUrl = makePublicUrl(s3Key);
      
      log("instagramIngest", "url_generated", {
        ig_id: m.id,
        s3_key: s3Key,
        public_url: publicUrl.substring(0, 100)
      });

      // Validate URL is HTTPS
      if (!publicUrl.startsWith("https://")) {
        log("instagramIngest", "url_not_https", {
          ig_id: m.id,
          url: publicUrl.substring(0, 100),
          APP_URL: process.env.APP_URL
        });
        // Don't fail, but log warning
      }

      // Save to assets table
      const assetId = "asset_" + uuid();
      
      await q(
        `INSERT INTO assets (id, project_id, external_id, type, source, url, label, metadata)
         VALUES ($1, $2, $3, $4, 'instagram', $5, 'ig_media', $6)`,
        [
          assetId,
          project_id,
          m.id,  // external_id for duplicate detection
          isVideo ? "video" : "image",
          publicUrl,  // Store the PUBLIC URL, not internal
          JSON.stringify({
            ig_media_id: m.id,
            media_type: m.media_type,
            caption: m.caption,
            permalink: m.permalink,
            timestamp: m.timestamp
          })
        ]
      );

      stored++;

      log("instagramIngest", "asset_stored", {
        asset_id: assetId,
        ig_media_id: m.id,
        type: m.media_type,
        url: publicUrl.substring(0, 80)
      });

      // Queue Vision analysis (only for images)
      if (!skip_analysis && !isVideo) {
        await qAnalyze.add("analyze.instagram", {
          asset_id: assetId,
          project_id: project_id,
          image_url: publicUrl,  // Pass PUBLIC URL to Vision
          caption: m.caption,
          rebuild_event_id: eventId
        });

        analysisQueued++;

        log("instagramIngest", "analysis_queued", {
          asset_id: assetId,
          image_url: publicUrl.substring(0, 80)
        });
      }

    } catch (error: any) {
      log("instagramIngest", "process_error", {
        ig_media_id: m.id,
        error: error.message
      });
      skipped++;
    }
  }

  // =========================================================
  // 5. Update brand_profiles
  // =========================================================
  
  await q(
    `UPDATE brand_profiles 
     SET profile = COALESCE(profile, '{}'::jsonb) || $1::jsonb 
     WHERE project_id = $2`,
    [
      JSON.stringify({
        ingest: {
          ig_media_count: mediaItems.length,
          stored_count: stored,
          last_ingest: new Date().toISOString()
        }
      }),
      project_id
    ]
  );

  // =========================================================
  // 6. Mark event as complete if no analysis needed
  // =========================================================
  
  if (analysisQueued === 0) {
    await q(
      `UPDATE brand_rebuild_events 
       SET status = 'skipped', completed_at = NOW(),
           metadata = jsonb_set(COALESCE(metadata, '{}'), '{reason}', '"no_images_to_analyze"')
       WHERE id = $1`,
      [eventId]
    );
  }

  const duration = Date.now() - startTime;

  log("instagramIngest", "complete", {
    project_id,
    stored,
    skipped,
    analysis_queued: analysisQueued,
    event_id: eventId,
    duration_ms: duration
  });

  return {
    ok: true,
    stored,
    skipped,
    analysis_queued: analysisQueued,
    event_id: eventId
  };
}

// ============================================================
// RE-INGEST (for refresh)
// ============================================================

export async function reingestInstagram(
  project_id: string,
  force_reanalyze: boolean = false
): Promise<InstagramIngestResult> {
  
  log("instagramIngest", "reingest_start", { project_id, force_reanalyze });

  if (force_reanalyze) {
    // Delete existing analyses but keep assets
    await q(
      `DELETE FROM instagram_analyses 
       WHERE asset_id IN (
         SELECT id FROM assets WHERE project_id = $1 AND source = 'instagram'
       )`,
      [project_id]
    );
    
    await q(
      `DELETE FROM detected_products WHERE project_id = $1`,
      [project_id]
    );

    log("instagramIngest", "reingest_cleared", { project_id });
  }

  return instagramIngest({ project_id });
}
