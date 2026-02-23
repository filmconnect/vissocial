// ============================================================
// WORKER.TS - BullMQ Workers (Production Debug Edition)
// ============================================================

// Debug env vars — this runs BEFORE any imports
console.log("=== WORKER ENV DEBUG ===");
console.log("REDIS_URL:", process.env.REDIS_URL ? process.env.REDIS_URL.replace(/:[^:@]+@/, ":***@") : "MISSING");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("RAILWAY_ENVIRONMENT:", process.env.RAILWAY_ENVIRONMENT || "NOT SET");
console.log("DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "MISSING");
console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "SET" : "MISSING");
console.log("FAL_KEY:", process.env.FAL_KEY ? "SET" : "MISSING");
console.log("BLOB_READ_WRITE_TOKEN:", process.env.BLOB_READ_WRITE_TOKEN ? "SET" : "MISSING");
console.log("APP_DEBUG:", process.env.APP_DEBUG || "NOT SET");
console.log("PORT:", process.env.PORT || "NOT SET (will use 3000)");
console.log("========================");

// Catch silent crashes
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

// Only load .env in development
if (process.env.NODE_ENV !== "production" && !process.env.RAILWAY_ENVIRONMENT) {
  try { require("dotenv/config"); } catch {}
}

// ============================================================
// HEALTH CHECK SERVER - must be early so Railway doesn't kill us
// ============================================================
import { createServer } from "http";
const PORT = process.env.PORT || 3000;

let workerHealthy = true;
let redisConnected = false;
let lastRedisError: string | null = null;
let jobsProcessed = 0;
let jobsFailed = 0;

createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    const status = {
      status: workerHealthy ? "ok" : "degraded",
      redis: redisConnected ? "connected" : "disconnected",
      lastRedisError,
      jobsProcessed,
      jobsFailed,
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  } else {
    res.writeHead(200);
    res.end("worker ok");
  }
}).listen(PORT, () => {
  console.log(`[worker] Health check listening on port ${PORT}`);
});

// ============================================================
// IMPORTS
// ============================================================
import IORedis from "ioredis";
import { Worker } from "bullmq";
import { config } from "@/lib/config";
import { log, logError } from "@/lib/logger";

import { instagramIngest } from "./processors/instagramIngest";
import { planGenerate } from "./processors/planGenerate";
import { renderFlux } from "./processors/renderFlux";
import { publishInstagram } from "./processors/publishInstagram";
import { metricsIngest } from "./processors/metricsIngest";
import { scheduleTick } from "./processors/scheduleTick";
import { analyzeInstagram } from "./processors/analyzeInstagram";
import { brandRebuild } from "./processors/brandRebuild";
import { qPublish } from "@/lib/jobs";
import { ensureBucket } from "@/lib/storage";

// ============================================================
// REDIS CONNECTION with monitoring
// ============================================================

log("worker", "boot", {
  redis: config.redisUrl ? config.redisUrl.replace(/:[^:@]+@/, ":***@") : "MISSING",
  pid: process.pid,
});

// Create a shared IORedis connection for monitoring
const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: true,
  retryStrategy(times: number) {
    const delay = Math.min(times * 500, 5000);
    log("redis", "retry", { attempt: times, delay_ms: delay });
    return delay;
  },
});

redisConnection.on("connect", () => {
  redisConnected = true;
  log("redis", "connected", { url: config.redisUrl?.replace(/:[^:@]+@/, ":***@") });
});

redisConnection.on("ready", () => {
  redisConnected = true;
  log("redis", "ready");
});

redisConnection.on("error", (err) => {
  redisConnected = false;
  lastRedisError = err.message;
  logError("redis", "connection error", err);
});

redisConnection.on("close", () => {
  redisConnected = false;
  log("redis", "connection closed");
});

redisConnection.on("reconnecting", () => {
  log("redis", "reconnecting");
});

// BullMQ connection config — use URL string, let BullMQ handle it
const connection = { url: config.redisUrl };

const baseWorkerConfig = {
  connection,
  lockDuration: 60000,
  stalledInterval: 30000,
  maxStalledCount: 2,
};

// ============================================================
// ENSURE STORAGE BUCKET
// ============================================================
try {
  await ensureBucket();
} catch (e: any) {
  log("worker", "ensureBucket failed (non-fatal)", { error: e.message });
}

// ============================================================
// HELPER: Wrap processor with logging
// ============================================================
function wrapProcessor(
  queueName: string,
  handlers: Record<string, (data: any) => Promise<any>>
) {
  return async (job: any) => {
    const startTime = Date.now();
    log(`worker:${queueName}`, "job received", {
      name: job.name,
      id: job.id,
      data: job.data,
      attempt: job.attemptsMade + 1,
    });

    const handler = handlers[job.name];
    if (!handler) {
      const err = new Error(`Unknown job: ${job.name} in ${queueName}`);
      logError(`worker:${queueName}`, "unknown job type", err);
      throw err;
    }

    try {
      const res = await handler(job.data);
      const duration = Date.now() - startTime;
      jobsProcessed++;
      log(`worker:${queueName}`, "job finished", {
        name: job.name,
        id: job.id,
        duration_ms: duration,
        result_summary: res ? Object.keys(res) : null,
      });
      return res;
    } catch (e: any) {
      const duration = Date.now() - startTime;
      jobsFailed++;
      logError(`worker:${queueName}`, "job failed", e, {
        name: job.name,
        id: job.id,
        duration_ms: duration,
        data: job.data,
      });
      throw e;
    }
  };
}

// ============================================================
// INGEST WORKER
// ============================================================
new Worker(
  "q_ingest",
  wrapProcessor("q_ingest", {
    "instagram.ingest": instagramIngest,
  }),
  { ...baseWorkerConfig }
);

// ============================================================
// LLM WORKER (plan.generate)
// ============================================================
new Worker(
  "q_llm",
  wrapProcessor("q_llm", {
    "plan.generate": planGenerate,
  }),
  { ...baseWorkerConfig, lockDuration: 120000, concurrency: 1 }
);

// ============================================================
// RENDER WORKER (fal.ai)
// ============================================================
new Worker(
  "q_render",
  wrapProcessor("q_render", {
    "render.flux": renderFlux,
  }),
  { ...baseWorkerConfig, lockDuration: 180000, concurrency: 3 }  // INCREASED from 90s to 180s for fal.ai
);

// ============================================================
// PUBLISH WORKER
// ============================================================
new Worker(
  "q_publish",
  wrapProcessor("q_publish", {
    "publish.instagram": publishInstagram,
    "schedule.tick": scheduleTick,
  }),
  { ...baseWorkerConfig, concurrency: 3, limiter: { max: 10, duration: 60000 } }
);

// ============================================================
// METRICS WORKER
// ============================================================
new Worker(
  "q_metrics",
  wrapProcessor("q_metrics", {
    "metrics.ingest": metricsIngest,
  }),
  { ...baseWorkerConfig }
);

// ============================================================
// ANALYZE WORKER (Vision API)
// ============================================================
new Worker(
  "q_analyze",
  wrapProcessor("q_analyze", {
    "analyze.instagram": analyzeInstagram,
  }),
  { ...baseWorkerConfig, lockDuration: 90000, concurrency: 3 }
);

// ============================================================
// BRAND REBUILD WORKER
// ============================================================
new Worker(
  "q_brand_rebuild",
  wrapProcessor("q_brand_rebuild", {
    "brand.rebuild": brandRebuild,
  }),
  { ...baseWorkerConfig, concurrency: 1 }
);

// ============================================================
// SCHEDULE POLLING
// ============================================================
(async () => {
  try {
    log("worker:scheduler", "schedule.tick setup start");
    const repeatableJobs = await qPublish.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === "schedule.tick") {
        await qPublish.removeRepeatableByKey(job.key);
      }
    }
    await qPublish.add(
      "schedule.tick",
      { project_id: "proj_local" },
      {
        repeat: { every: 5 * 60 * 1000 },
        jobId: "schedule-tick-main",
        removeOnComplete: true,
        removeOnFail: 10,
      }
    );
    log("worker:scheduler", "schedule.tick registered - every 5 minutes");
  } catch (e: any) {
    logError("worker:scheduler", "schedule.tick registration failed", e);
  }
})();

log("worker", "All workers started", {
  queues: ["q_ingest", "q_llm", "q_render", "q_publish", "q_metrics", "q_analyze", "q_brand_rebuild"],
  lockDurations: {
    q_ingest: 60000,
    q_llm: 120000,
    q_render: 180000,
    q_publish: 60000,
    q_metrics: 60000,
    q_analyze: 90000,
    q_brand_rebuild: 60000,
  },
});
