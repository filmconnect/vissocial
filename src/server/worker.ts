// ============================================================
// WORKER.TS - BullMQ Workers (FIXED)
// ============================================================
// FIXES:
// - Added lockDuration (60s) to prevent lock expiration
// - Added stalledInterval to detect stalled jobs
// - Increased concurrency for q_publish
// - Schedule.tick no longer blocks other jobs
// ============================================================

// Only load .env in development (Railway provides env vars directly)
if (process.env.NODE_ENV !== "production") {
  try { require("dotenv/config"); } catch {}
}
import { Worker } from "bullmq";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";

// Existing processors
import { instagramIngest } from "./processors/instagramIngest";
import { planGenerate } from "./processors/planGenerate";
import { renderFlux } from "./processors/renderFlux";
import { publishInstagram } from "./processors/publishInstagram";
import { metricsIngest } from "./processors/metricsIngest";
import { scheduleTick } from "./processors/scheduleTick";

// Vision processors
import { analyzeInstagram } from "./processors/analyzeInstagram";
import { brandRebuild } from "./processors/brandRebuild";

import { qPublish } from "@/lib/jobs";
import { ensureBucket } from "@/lib/storage";

const connection = { url: config.redisUrl };

// ============================================================
// WORKER CONFIG - PREVENTS LOCK ISSUES
// ============================================================
const baseWorkerConfig = {
  connection,
  lockDuration: 60000,      // 60 seconds (default is 30s - too short!)
  stalledInterval: 30000,   // Check for stalled jobs every 30s
  maxStalledCount: 2,       // Retry stalled jobs up to 2 times
};

log("worker", "boot", {
  redis: config.redisUrl,
  pid: process.pid,
  lockDuration: baseWorkerConfig.lockDuration
});

// Ensure MinIO bucket exists
await ensureBucket();

// ============================================================
// INGEST WORKER
// ============================================================
new Worker(
  "q_ingest",
  async (job) => {
    log("worker:q_ingest", "job received", {
      name: job.name,
      id: job.id,
      data: job.data
    });

    try {
      if (job.name === "instagram.ingest") {
        const res = await instagramIngest(job.data);
        log("worker:q_ingest", "job finished", res);
        return res;
      }
      throw new Error("Unknown ingest job: " + job.name);
    } catch (e: any) {
      log("worker:q_ingest", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  },
  { ...baseWorkerConfig }
);

// ============================================================
// LLM WORKER (plan.generate)
// ============================================================
new Worker(
  "q_llm",
  async (job) => {
    log("worker:q_llm", "job received", {
      name: job.name,
      id: job.id,
      data: job.data
    });

    try {
      if (job.name === "plan.generate") {
        const res = await planGenerate(job.data);
        log("worker:q_llm", "job finished", res);
        return res;
      }
      throw new Error("Unknown llm job: " + job.name);
    } catch (e: any) {
      log("worker:q_llm", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  },
  { 
    ...baseWorkerConfig,
    lockDuration: 120000,  // 2 minutes for LLM calls (they take time)
    concurrency: 1         // One at a time to avoid rate limits
  }
);

// ============================================================
// RENDER WORKER (fal.ai)
// ============================================================
new Worker(
  "q_render",
  async (job) => {
    log("worker:q_render", "job received", {
      name: job.name,
      id: job.id,
      data: job.data
    });

    try {
      if (job.name === "render.flux") {
        const res = await renderFlux(job.data);
        log("worker:q_render", "job finished", res);
        return res;
      }
      throw new Error("Unknown render job: " + job.name);
    } catch (e: any) {
      log("worker:q_render", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  },
  { 
    ...baseWorkerConfig,
    lockDuration: 90000,  // 90 seconds for render
    concurrency: 3        // 3 parallel renders
  }
);

// ============================================================
// PUBLISH WORKER (schedule.tick + publish.instagram)
// ============================================================
new Worker(
  "q_publish",
  async (job) => {
    log("worker:q_publish", "job received", {
      name: job.name,
      id: job.id,
      data: job.data
    });

    try {
      if (job.name === "publish.instagram") {
        const res = await publishInstagram(job.data);
        log("worker:q_publish", "job finished", res);
        return res;
      }

      if (job.name === "schedule.tick") {
        const res = await scheduleTick(job.data);
        log("worker:q_publish", "schedule.tick done", res);
        return res;
      }

      throw new Error("Unknown publish job: " + job.name);
    } catch (e: any) {
      log("worker:q_publish", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  },
  { 
    ...baseWorkerConfig,
    concurrency: 3,  // ✅ Increased from 1 to 3
    limiter: {
      max: 10,
      duration: 60000
    }
  }
);

// ============================================================
// METRICS WORKER
// ============================================================
new Worker(
  "q_metrics",
  async (job) => {
    log("worker:q_metrics", "job received", {
      name: job.name,
      id: job.id,
      data: job.data
    });

    try {
      if (job.name === "metrics.ingest") {
        const res = await metricsIngest(job.data);
        log("worker:q_metrics", "job finished", res);
        return res;
      }
      throw new Error("Unknown metrics job: " + job.name);
    } catch (e: any) {
      log("worker:q_metrics", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  },
  { ...baseWorkerConfig }
);

// ============================================================
// ANALYZE WORKER (Vision API)
// ============================================================
new Worker(
  "q_analyze",
  async (job) => {
    log("worker:q_analyze", "job received", {
      name: job.name,
      id: job.id,
      data: job.data
    });

    try {
      if (job.name === "analyze.instagram") {
        const res = await analyzeInstagram(job.data);
        log("worker:q_analyze", "job finished", {
          asset_id: res.asset_id,
          success: res.success,
          products_found: res.products_found
        });
        return res;
      }
      throw new Error("Unknown analyze job: " + job.name);
    } catch (e: any) {
      log("worker:q_analyze", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  },
  { 
    ...baseWorkerConfig,
    lockDuration: 90000,  // 90 seconds for Vision API
    concurrency: 3        // 3 parallel analyses
  }
);

// ============================================================
// BRAND REBUILD WORKER
// ============================================================
new Worker(
  "q_brand_rebuild",
  async (job) => {
    log("worker:q_brand_rebuild", "job received", {
      name: job.name,
      id: job.id,
      data: job.data
    });

    try {
      if (job.name === "brand.rebuild") {
        const res = await brandRebuild(job.data);
        log("worker:q_brand_rebuild", "job finished", {
          project_id: job.data.project_id,
          success: res.success
        });
        return res;
      }
      throw new Error("Unknown brand rebuild job: " + job.name);
    } catch (e: any) {
      log("worker:q_brand_rebuild", "job failed", {
        name: job.name,
        error: e.message,
        stack: e.stack
      });
      throw e;
    }
  },
  { 
    ...baseWorkerConfig,
    concurrency: 1  // Only 1 rebuild at a time
  }
);

// ============================================================
// SCHEDULE POLLING (with better job options)
// ============================================================
(async () => {
  try {
    log("worker:scheduler", "schedule.tick setup start");
    
    // Remove old repeatable jobs first
    const repeatableJobs = await qPublish.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.name === "schedule.tick") {
        await qPublish.removeRepeatableByKey(job.key);
        log("worker:scheduler", "removed old schedule.tick", { key: job.key });
      }
    }
    
    // Add new schedule.tick with proper options
    await qPublish.add(
      "schedule.tick", 
      { project_id: "proj_local" },
      { 
        repeat: { 
          every: 5 * 60 * 1000  // 5 minutes
        },
        jobId: "schedule-tick-main",
        removeOnComplete: true,  // ✅ Clean up completed jobs
        removeOnFail: 10         // Keep last 10 failed for debugging
      }
    );
    
    log("worker:scheduler", "schedule.tick registered - every 5 minutes");
    
  } catch (e: any) {
    log("worker:scheduler", "schedule.tick registration failed", {
      error: e.message
    });
  }
})();

log("worker", "Workers running.", {
  queues: [
    "q_ingest",
    "q_llm", 
    "q_render",
    "q_publish",
    "q_metrics",
    "q_analyze",
    "q_brand_rebuild"
  ]
});
