// ============================================================
// JOBS.TS - BullMQ Queue Definitions (Production Debug Edition)
// ============================================================
// Centralno mjesto za definiciju svih job queues.
// ADDED: Queue event listeners for production monitoring
// ============================================================

import { Queue, QueueEvents } from "bullmq";
import { config } from "./config";
import { log, logError } from "./logger";

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
 */
export const qAnalyze = new Queue("q_analyze", { 
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

/**
 * Brand profile rebuild queue
 * Jobs: brand.rebuild
 */
export const qBrandRebuild = new Queue("q_brand_rebuild", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: "fixed",
      delay: 10000,
    },
    removeOnComplete: { count: 20 },
    removeOnFail: { count: 20 },
  },
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
  brandRebuild: qBrandRebuild,
};

// ============================================================
// QUEUE EVENT LISTENERS (Production monitoring)
// ============================================================
// Only attach in worker process (not frontend)
// Check for RAILWAY_ENVIRONMENT or explicit flag

const IS_WORKER = !!process.env.RAILWAY_ENVIRONMENT 
  || process.env.WORKER_MODE === "true"
  || process.argv.some(a => a.includes("worker"));

if (IS_WORKER) {
  const monitoredQueues = ["q_llm", "q_render", "q_ingest", "q_analyze", "q_brand_rebuild"];

  for (const queueName of monitoredQueues) {
    try {
      const events = new QueueEvents(queueName, { connection });

      events.on("completed", ({ jobId, returnvalue }) => {
        log(`queue:${queueName}`, "job completed", { jobId, returnvalue: String(returnvalue).substring(0, 200) });
      });

      events.on("failed", ({ jobId, failedReason }) => {
        logError(`queue:${queueName}`, "job failed (event)", { message: failedReason }, { jobId });
      });

      events.on("stalled", ({ jobId }) => {
        log(`queue:${queueName}`, "job STALLED", { jobId });
      });

      events.on("error", (err) => {
        logError(`queue:${queueName}`, "queue event error", err);
      });

    } catch (e: any) {
      logError("jobs", `failed to attach events for ${queueName}`, e);
    }
  }

  log("jobs", "queue event listeners attached", { queues: monitoredQueues });
}

// ============================================================
// HELPER: Queue status check
// ============================================================

export async function getQueueStats() {
  const stats: Record<string, any> = {};
  
  for (const [name, queue] of Object.entries(allQueues)) {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
      ]);
      
      stats[name] = { waiting, active, completed, failed, delayed };
    } catch (error: any) {
      stats[name] = { error: error.message };
    }
  }
  
  return stats;
}

// ============================================================
// HELPER: Get failed jobs for debugging
// ============================================================

export async function getFailedJobs(queueName: keyof typeof allQueues, count = 5) {
  const queue = allQueues[queueName];
  if (!queue) return [];

  try {
    const failed = await queue.getFailed(0, count - 1);
    return failed.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn,
    }));
  } catch (e: any) {
    return [{ error: e.message }];
  }
}
