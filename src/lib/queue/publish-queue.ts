import "server-only";

import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

import {
  BULLMQ_CONNECTION_OPTIONS,
  PUBLISH_QUEUE_NAME,
  redisConfigFromEnv,
} from "@/lib/queue/connection";
import { PUBLISH_BACKOFF_MS, PUBLISH_MAX_ATTEMPTS } from "@/lib/publishing/errors";

/**
 * master.txt 3.4: the queue carries identifiers and nothing else. A token, a
 * post body or an image URL in Redis would outlive the job that owns it and be
 * readable by anything holding the connection string, so the worker loads all
 * of it from the database at the moment it runs.
 */

export type PublishJobPayload = {
  postTargetId: string;
  postId: string;
  workspaceId: string;
  /** Media ids, resolved to bytes inside the worker. */
  mediaIds: string[];
};

export function publishJobId(postTargetId: string): string {
  // BullMQ reserves `:` inside a job id, so use a dash.
  return `publish-${postTargetId}`;
}

export function buildPublishJobOptions(runAt: Date, now: Date = new Date()): JobsOptions {
  const delay = Math.max(0, runAt.getTime() - now.getTime());

  return {
    jobId: undefined,
    delay,
    attempts: PUBLISH_MAX_ATTEMPTS,
    // master.txt 3.9: 30s, then 2m, then 10m. Exponential from 30s lands
    // exactly on that, so the two cannot drift apart.
    backoff: { type: "exponential", delay: PUBLISH_BACKOFF_MS },
    removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
    removeOnFail: { age: 30 * 24 * 3600, count: 5000 },
  };
}

let queue: Queue<PublishJobPayload> | null = null;
let connection: IORedis | null = null;

function getQueue(): Queue<PublishJobPayload> {
  if (queue) {
    return queue;
  }

  const config = redisConfigFromEnv();
  connection = new IORedis({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    db: config.db,
    ...(config.tls ? { tls: {} } : {}),
    ...BULLMQ_CONNECTION_OPTIONS,
  });

  queue = new Queue<PublishJobPayload>(PUBLISH_QUEUE_NAME, { connection });

  return queue;
}

/**
 * Next.js keeps module state alive between requests, and more than one instance
 * runs in production, so a failed connect must not poison the next call.
 */
async function withQueue<T>(operation: (queue: Queue<PublishJobPayload>) => Promise<T>): Promise<T> {
  try {
    return await operation(getQueue());
  } catch (error) {
    if (queue) {
      await queue.close().catch(() => {});
      queue = null;
    }

    if (connection) {
      connection.disconnect();
      connection = null;
    }

    throw error;
  }
}

/**
 * BullMQ 6 takes the job name as the first argument to `add()`. Using the
 * deterministic name as the id too gives free deduplication: adding a job whose
 * id already exists is a no-op rather than a second publish.
 */
export async function enqueuePublishJob(
  payload: PublishJobPayload,
  runAt: Date,
  now: Date = new Date(),
): Promise<string | undefined> {
  const name = publishJobId(payload.postTargetId);
  const job = await withQueue((target) =>
    target.add(name, payload, { ...buildPublishJobOptions(runAt, now), jobId: name }),
  );

  return job.id;
}

/**
 * BullMQ cannot move a delayed job, so rescheduling means replacing it. Attempt
 * history survives in `PublishAttempt`, which is the record worth keeping.
 */
export async function reschedulePublishJob(
  payload: PublishJobPayload,
  runAt: Date,
  now: Date = new Date(),
): Promise<string | undefined> {
  const name = publishJobId(payload.postTargetId);
  const job = await withQueue(async (target) => {
    const existing = await target.getJob(name);

    if (existing) {
      await existing.remove().catch(() => undefined);
    }

    return target.add(name, payload, { ...buildPublishJobOptions(runAt, now), jobId: name });
  });

  return job.id;
}

export async function cancelPublishJob(postTargetId: string): Promise<void> {
  await withQueue(async (target) => {
    const job = await target.getJob(publishJobId(postTargetId));

    if (job) {
      // Removes the job from Redis, the delayed set and the wait list.
      await job.remove().catch(() => undefined);
    }
  });
}

export type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
};

export async function getPublishQueueCounts(): Promise<QueueCounts> {
  return withQueue(async (target) => {
    const counts = await target.getJobCounts("waiting", "active", "delayed", "failed");

    return {
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      failed: counts.failed ?? 0,
    };
  });
}

export async function closePublishQueue(): Promise<void> {
  if (queue) {
    await queue.close().catch(() => {});
    queue = null;
  }

  if (connection) {
    connection.disconnect();
    connection = null;
  }
}
