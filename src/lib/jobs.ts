// ============================================================
// JOBS.TS - BullMQ Queue Definitions
// ============================================================
// Centralno mjesto za definiciju svih job queues.
// UPDATED: Dodani qAnalyze i qBrandRebuild
// ============================================================

import { Queue } from "bullmq";
import { config } from "./config";

const connection = { url: config.redisUrl };

// ============================================================
// EXISTING QUEUES
// ============================================================

/** Instagram media ingest queue */
export const qIngest = new Queue("q_ingest", { connection });

/** LLM/GPT operations (plan generation, etc.) */
export const qLLM = new Queue("q_llm", { connection });

/** Image rendering via fal.ai */
export const qRender = new Queue("q_render", { connection });

/** Export operations */
export const qExport = new Queue("q_export", { connection });

/** Instagram publishing */
export const qPublish = new Queue("q_publish", { connection });

/** Metrics collection */
export const qMetrics = new Queue("q_metrics", { connection });

// ============================================================
// NEW QUEUES (FAZA 1)
// ============================================================

/** 
 * Vision analysis queue
 * Jobs: analyze.instagram
 * Processes individual images with GPT-4 Vision
 */
export const qAnalyze = new Queue("q_analyze", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000 // 5s, 10s, 20s
    },
    removeOnComplete: {
      count: 100 // Keep last 100 completed jobs
    },
    removeOnFail: {
      count: 50 // Keep last 50 failed jobs for debugging
    }
  }
});

/**
 * Brand profile rebuild queue
 * Jobs: brand.rebuild
 * Aggregates analyses into brand profile
 */
export const qBrandRebuild = new Queue("q_brand_rebuild", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 10000 // 10s retry
    },
    removeOnComplete: {
      count: 20
    },
    removeOnFail: {
      count: 20
    }
  }
});

// ============================================================
// HELPER: Get all queues (for monitoring/admin)
// ============================================================

export const allQueues = {
  ingest: qIngest,
  llm: qLLM,
  render: qRender,
  export: qExport,
  publish: qPublish,
  metrics: qMetrics,
  analyze: qAnalyze,
  brandRebuild: qBrandRebuild
};

// ============================================================
// HELPER: Queue status check
// ============================================================

export async function getQueueStats() {
  const stats: Record<string, any> = {};
  
  for (const [name, queue] of Object.entries(allQueues)) {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount()
      ]);
      
      stats[name] = { waiting, active, completed, failed };
    } catch (error) {
      stats[name] = { error: "Failed to get stats" };
    }
  }
  
  return stats;
}
