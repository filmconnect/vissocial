import { Worker } from "bullmq";
import { config } from "@/lib/config";
import { log } from "@/lib/logger";
import { instagramIngest } from "./processors/instagramIngest";
import { planGenerate } from "./processors/planGenerate";
import { renderFlux } from "./processors/renderFlux";
import { publishInstagram } from "./processors/publishInstagram";
import { metricsIngest } from "./processors/metricsIngest";
import { scheduleTick } from "./processors/scheduleTick";

const connection = { url: config.redisUrl };

new Worker("q_ingest", async (job) => {
  log("worker:q_ingest", `job ${job.name}`, job.data);
  if (job.name === "instagram.ingest") return instagramIngest(job.data);
  throw new Error("Unknown ingest job: " + job.name);
}, { connection });

new Worker("q_llm", async (job) => {
  log("worker:q_llm", `job ${job.name}`, job.data);
  if (job.name === "plan.generate") return planGenerate(job.data);
  throw new Error("Unknown llm job: " + job.name);
}, { connection });

new Worker("q_render", async (job) => {
  log("worker:q_render", `job ${job.name}`, job.data);
  if (job.name === "render.flux") return renderFlux(job.data);
  throw new Error("Unknown render job: " + job.name);
}, { connection });

new Worker("q_publish", async (job) => {
  log("worker:q_publish", `job ${job.name}`, job.data);
  if (job.name === "publish.instagram") return publishInstagram(job.data);
  if (job.name === "schedule.tick") return scheduleTick(job.data);
  throw new Error("Unknown publish job: " + job.name);
}, { connection });

new Worker("q_metrics", async (job) => {
  log("worker:q_metrics", `job ${job.name}`, job.data);
  if (job.name === "metrics.ingest") return metricsIngest(job.data);
  throw new Error("Unknown metrics job: " + job.name);
}, { connection });

import { qPublish } from "@/lib/jobs";

// Schedule polling: every 60s check scheduled posts (in-app schedule)
(async () => {
  try {
    await qPublish.add("schedule.tick", {}, { repeat: { every: 60_000 } });
  } catch {}
})();

log("worker", "Workers running.");

