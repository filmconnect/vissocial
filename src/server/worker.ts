// ============================================================
// WORKER.TS - BullMQ Workers
// ============================================================
// Background job processors.
// UPDATED: Dodani wAnalyze i wBrandRebuild
// ============================================================

import "dotenv/config";
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

// NEW processors (FAZA 1)
import { analyzeInstagram } from "./processors/analyzeInstagram";
import { brandRebuild } from "./processors/brandRebuild";

import { qPublish } from "@/lib/jobs";
import { ensureBucket } from "@/lib/storage";

const connection = { url: config.redisUrl };

log("worker", "boot", {
  redis: config.redisUrl,
  pid: process.pid
});

// Ensure MinIO bucket exists
await ensureBucket();

// ============================================================
// EXISTING WORKERS
// ============================================================

// Ingest Worker
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
  { connection }
);

// LLM Worker
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
  { connection }
);

// Render Worker
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
  { connection }
);

// Publish Worker
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
    connection,
    concurrency: 2, // ← PROMIJENJENO sa 1 na 2
    limiter: {     // ← DODANO
      max: 10,
      duration: 60000
    }
  }
);

// Metrics Worker
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
  { connection }
);

// ============================================================
// NEW WORKERS (FAZA 1)
// ============================================================

// Analyze Worker - Vision API analysis
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
    connection,
    concurrency: 3 // Process 3 images in parallel (respect rate limits)
  }
);

// Brand Rebuild Worker
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
    connection,
    concurrency: 1 // Only 1 rebuild at a time per project
  }
);

// ============================================================
// SCHEDULE POLLING (OPTIMIZED)
// ============================================================

(async () => {
  try {
    log("worker:scheduler", "schedule.tick setup start");
    
    // ✅ PROMIJENI SA 60s NA 5min
    await qPublish.add(
      "schedule.tick", 
      { project_id: "proj_local" }, // ← DODAJ project_id
      { 
        repeat: { 
          every: 5 * 60 * 1000 // ← 5 minuta (300,000 ms)
        },
        jobId: "schedule-tick-repeating" // ← Fiksni ID
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
    "q_analyze",      // NEW
    "q_brand_rebuild" // NEW
  ]
});
