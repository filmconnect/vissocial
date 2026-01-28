import "dotenv/config";
import { Worker } from "bullmq";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { instagramIngest } from "./processors/instagramIngest";
import { planGenerate } from "./processors/planGenerate";
import { renderFlux } from "./processors/renderFlux";
import { publishInstagram } from "./processors/publishInstagram";
import { metricsIngest } from "./processors/metricsIngest";
import { scheduleTick } from "./processors/scheduleTick";
import { qPublish } from "@/lib/jobs";

const connection = { url: config.redisUrl };
log("worker", "boot", {
  redis: config.redisUrl,
  pid: process.pid
});


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
  { connection }
);

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

// Schedule polling
(async () => {
  try {
    log("worker:scheduler", "schedule.tick registered");
    await qPublish.add("schedule.tick", {}, { repeat: { every: 60_000 } });
  } catch (e: any) {
    log("worker:scheduler", "schedule.tick registration failed", {
      error: e.message
    });
  }
})();

log("worker", "Workers running.");
