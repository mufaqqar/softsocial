import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { randomUUID } from "node:crypto";

import {
  BULLMQ_CONNECTION_OPTIONS,
  PUBLISH_QUEUE_NAME,
  redisConfigFromEnv,
} from "@/lib/queue/connection";
import type { PublishJobPayload } from "@/lib/queue/publish-queue";
import { runPublishJob } from "@/worker/publish";

/**
 * master.txt 3.3. The worker is a separate long-running process from the web
 * app, because a Vercel function cannot hold a BullMQ connection open and the
 * publish pipeline must survive a request completing.
 *
 * Run it with `npm run worker`. It is deliberately not part of `next build`.
 *
 * The payload carries ids only; everything else is loaded from the database
 * inside the job, so a delayed job always sees current data and a token is never
 * at rest in Redis.
 */

const WORKER_ID = `worker-${randomUUID().slice(0, 8)}`;
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);

const config = redisConfigFromEnv();

const connection = new IORedis({
  host: config.host,
  port: config.port,
  username: config.username,
  password: config.password,
  db: config.db,
  ...(config.tls ? { tls: {} } : {}),
  ...BULLMQ_CONNECTION_OPTIONS,
});

/** Never let a credential or a token reach the log, even via an error object. */
function redact(value: unknown): string {
  const text = value instanceof Error ? `${value.name}: ${value.message}` : String(value);

  return text.replace(/[A-Za-z0-9_\-]{40,}/g, "[redacted]").slice(0, 500);
}

const worker = new Worker<PublishJobPayload>(
  PUBLISH_QUEUE_NAME,
  async (job: Job<PublishJobPayload>) => {
    const { postTargetId } = job.data;

    // The attempt number BullMQ tracks and the one we record must agree, so the
    // PublishAttempt history matches the backoff that produced it.
    const attempt = job.attemptsMade + 1;

    await runPublishJob({ postTargetId, workerId: WORKER_ID, attempt });
  },
  {
    connection,
    concurrency: CONCURRENCY,
    // A publish involves an upload and a provider round trip, so the default
    // 30s lock is too tight; a stalled job would be retried and could double
    // publish past the idempotency window.
    lockDuration: 120_000,
  },
);

worker.on("completed", (job) => {
  console.log(`[${WORKER_ID}] completed ${job.name}`);
});

worker.on("failed", (job, error) => {
  console.error(`[${WORKER_ID}] failed ${job?.name ?? "unknown"}: ${redact(error)}`);
});

worker.on("error", (error) => {
  console.error(`[${WORKER_ID}] worker error: ${redact(error)}`);
});

async function shutdown(signal: string) {
  console.log(`[${WORKER_ID}] ${signal} received, finishing in-flight publishes.`);

  // Close first so no new job starts, then let the current one finish, so a
  // publish is never abandoned between the provider call and the database write.
  await worker.close();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.log(`[${WORKER_ID}] listening on ${PUBLISH_QUEUE_NAME} with concurrency ${CONCURRENCY}.`);
