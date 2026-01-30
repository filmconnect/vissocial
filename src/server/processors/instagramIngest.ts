// ============================================================
// INSTAGRAM INGEST PROCESSOR
// ============================================================
// Povlači media s Instagrama, sprema u MinIO i assets tablicu.
// UPDATED: Trigira Vision analizu za svaku sliku.
// ============================================================

import { q } from "@/lib/db";
import { graphGET } from "@/lib/instagram";
import { downloadToBuffer, putObject } from "@/lib/storage";
import { v4 as uuid } from "uuid";
import { log } from "@/lib/logger";
import { qAnalyze } from "@/lib/jobs";
import { config } from "@/lib/config";
import { makePublicUrl } from "@/lib/makePublicUrl";



// ============================================================
// TYPES
// ============================================================

export interface InstagramIngestInput {
  project_id: string;
  limit?: number;
  skip_analysis?: boolean; // Za testiranje bez Vision API
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
    return {
      ok: false,
      stored: 0,
      skipped: 0,
      analysis_queued: 0,
      reason: "instagram_api_error: " + error.message
    };
  }

  const mediaItems = media?.data ?? [];
  
  log("instagramIngest", "media_fetched", {
    project_id,
    count: mediaItems.length
  });

  if (mediaItems.length === 0) {
    return {
      ok: true,
      stored: 0,
      skipped: 0,
      analysis_queued: 0,
      reason: "no_media_found"
    };
  }

  // =========================================================
  // 3. Kreiraj brand_rebuild_event za tracking (ako ćemo analizirati)
  // =========================================================
  let eventId: string | undefined;
  
  if (!skip_analysis) {
    eventId = "evt_" + uuid();
    
    // Broji samo slike (ne videe za sada)
    const imageCount = mediaItems.filter(
      (m: any) => m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM"
    ).length;

    await q(
      `INSERT INTO brand_rebuild_events (
        id, project_id, trigger_type, status, 
        total_expected, analyses_completed
      )
      VALUES ($1, $2, 'instagram_ingest', 'analyzing', $3, 0)`,
      [eventId, project_id, imageCount]
    );

    log("instagramIngest", "rebuild_event_created", {
      event_id: eventId,
      total_expected: imageCount
    });
  }

  // =========================================================
  // 4. Procesiraj svaki media item
  // =========================================================
  let stored = 0;
  let skipped = 0;
  let analysisQueued = 0;

  for (const m of mediaItems) {
    const mediaUrl = m.media_url || m.thumbnail_url;
    
    if (!mediaUrl) {
      log("instagramIngest", "no_media_url", { ig_media_id: m.id });
      skipped++;
      continue;
    }

    // Provjeri postoji li već
    const existing = await q<any>(
      `SELECT id FROM assets 
       WHERE project_id = $1 
       AND metadata->>'ig_media_id' = $2`,
      [project_id, m.id]
    );

    if (existing.length > 0) {
      log("instagramIngest", "already_exists", { ig_media_id: m.id });
      skipped++;
      continue;
    }

    try {
      // Download sliku
      const buffer = await downloadToBuffer(mediaUrl);
      
      // Odredi tip i ekstenziju
      const isVideo = m.media_type === "VIDEO";
      const ext = isVideo ? "mp4" : "jpg";
      const contentType = isVideo ? "video/mp4" : "image/jpeg";
      
      // Upload u MinIO
      const key = `ig/${project_id}/${m.id}.${ext}`;
      const uploadedUrl = await putObject(key, buffer, contentType);
	  const publicUrl = makePublicUrl(uploadedUrl);

      // Spremi u assets tablicu
      const assetId = "asset_" + uuid();
      
      await q(
        `INSERT INTO assets (id, project_id, type, source, url, label, metadata)
         VALUES ($1, $2, $3, 'instagram', $4, 'ig_media', $5)`,
        [
          assetId,
          project_id,
          isVideo ? "video" : "image",
          publicUrl,
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
        type: m.media_type
      });

      // =========================================================
      // 5. Queue Vision analizu (samo za slike)
      // =========================================================
      if (!skip_analysis && !isVideo) {
        await qAnalyze.add("analyze.instagram", {
          asset_id: assetId,
          project_id: project_id,
          image_url: publicUrl,
          caption: m.caption,
          rebuild_event_id: eventId
        });

        analysisQueued++;

        log("instagramIngest", "analysis_queued", {
          asset_id: assetId,
          ig_media_id: m.id
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
  // 6. Update brand_profiles sa ingest metadata
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
  // 7. Ako nema slika za analizu, odmah označi event kao completed
  // =========================================================
  if (eventId && analysisQueued === 0) {
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
// MANUAL RE-INGEST (za refresh)
// ============================================================

export async function reingestInstagram(
  project_id: string,
  force_reanalyze: boolean = false
): Promise<InstagramIngestResult> {
  
  log("instagramIngest", "reingest_start", {
    project_id,
    force_reanalyze
  });

  if (force_reanalyze) {
    // Obriši postojeće analize (ali zadrži assete)
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

    log("instagramIngest", "reingest_cleared_analyses", { project_id });
  }

  return instagramIngest({ project_id });
}
