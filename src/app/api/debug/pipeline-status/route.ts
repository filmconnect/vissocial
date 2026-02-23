// ============================================================
// GET /api/debug/pipeline-status
// ============================================================
// Returns comprehensive pipeline health info for debugging.
// Checks: Redis, queues, recent DB items, renders.
// ============================================================

import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getQueueStats, getFailedJobs } from "@/lib/jobs";
import { config } from "@/lib/config";
import IORedis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET() {
  const result: Record<string, any> = {
    ts: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV,
      RAILWAY_ENVIRONMENT: process.env.RAILWAY_ENVIRONMENT || "NOT SET",
      REDIS_URL: config.redisUrl ? config.redisUrl.replace(/:[^:@]+@/, ":***@") : "MISSING",
      DATABASE_URL: process.env.DATABASE_URL ? "SET" : "MISSING",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "SET" : "MISSING",
      FAL_KEY: process.env.FAL_KEY ? "SET" : "MISSING",
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN ? "SET" : "MISSING",
      APP_DEBUG: process.env.APP_DEBUG || "NOT SET",
    },
  };

  // ====== Redis connectivity ======
  try {
    const redis = new IORedis(config.redisUrl, {
      connectTimeout: 5000,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    const pong = await redis.ping();
    result.redis = { status: "connected", ping: pong };
    await redis.quit();
  } catch (e: any) {
    result.redis = { status: "error", error: e.message };
  }

  // ====== Queue stats ======
  try {
    result.queues = await getQueueStats();
  } catch (e: any) {
    result.queues = { error: e.message };
  }

  // ====== Failed jobs (last 3 per critical queue) ======
  try {
    result.failedJobs = {
      llm: await getFailedJobs("llm", 3),
      render: await getFailedJobs("render", 3),
      ingest: await getFailedJobs("ingest", 3),
      analyze: await getFailedJobs("analyze", 3),
    };
  } catch (e: any) {
    result.failedJobs = { error: e.message };
  }

  // ====== Recent content items ======
  try {
    const items = await q<any>(
      `SELECT ci.id, ci.content_pack_id, ci.day, ci.format, ci.status, ci.created_at,
              r.id as render_id, r.status as render_status, r.outputs as render_outputs, r.updated_at as render_updated
       FROM content_items ci
       LEFT JOIN renders r ON r.content_item_id = ci.id
       ORDER BY ci.created_at DESC
       LIMIT 10`
    );
    result.recentItems = items.map((i: any) => ({
      id: i.id,
      pack: i.content_pack_id,
      day: i.day,
      format: i.format,
      status: i.status,
      created: i.created_at,
      render: i.render_id
        ? {
            id: i.render_id,
            status: i.render_status,
            has_url: !!(i.render_outputs?.url),
            url_preview: i.render_outputs?.url?.substring(0, 80),
            updated: i.render_updated,
          }
        : null,
    }));
  } catch (e: any) {
    result.recentItems = { error: e.message };
  }

  // ====== Recent content packs ======
  try {
    const packs = await q<any>(
      `SELECT cp.id, cp.project_id, cp.month, cp.created_at,
              COUNT(ci.id) as item_count,
              COUNT(r.id) as render_count,
              COUNT(CASE WHEN r.status = 'succeeded' THEN 1 END) as renders_succeeded,
              COUNT(CASE WHEN r.status = 'failed' THEN 1 END) as renders_failed,
              COUNT(CASE WHEN r.status = 'running' THEN 1 END) as renders_running
       FROM content_packs cp
       LEFT JOIN content_items ci ON ci.content_pack_id = cp.id
       LEFT JOIN renders r ON r.content_item_id = ci.id
       GROUP BY cp.id
       ORDER BY cp.created_at DESC
       LIMIT 5`
    );
    result.recentPacks = packs;
  } catch (e: any) {
    result.recentPacks = { error: e.message };
  }

  // ====== DB connectivity ======
  try {
    const dbCheck = await q<any>(`SELECT NOW() as now, current_database() as db`);
    result.database = { status: "connected", ...dbCheck[0] };
  } catch (e: any) {
    result.database = { status: "error", error: e.message };
  }

  return NextResponse.json(result, { status: 200 });
}
