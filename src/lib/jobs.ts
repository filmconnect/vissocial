import { Queue } from "bullmq";
import { config } from "./config";
const connection = { url: config.redisUrl };
export const qIngest = new Queue("q_ingest", { connection });
export const qLLM = new Queue("q_llm", { connection });
export const qRender = new Queue("q_render", { connection });
export const qExport = new Queue("q_export", { connection });
export const qPublish = new Queue("q_publish", { connection });
export const qMetrics = new Queue("q_metrics", { connection });
