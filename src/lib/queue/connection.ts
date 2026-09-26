/**
 * Redis connection for BullMQ.
 *
 * master.txt 3.3: the queue is Redis, the worker is a separate long-running
 * process. Nothing here is imported by a request handler beyond the producer in
 * `publish-queue.ts`, and the worker builds its own connection in `src/worker`.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it manages:
 * blocking commands must be able to wait indefinitely rather than fail fast,
 * which ioredis otherwise does by default.
 */

export const PUBLISH_QUEUE_NAME = "publish";

export type RedisConfig = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  /** Upstash and other serverless providers terminate TLS. */
  tls: boolean;
  db: number;
};

export function redisConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): RedisConfig {
  const url = env.REDIS_URL?.trim();

  if (!url) {
    throw new Error(
      "REDIS_URL is not set. The publish queue cannot run without Redis.",
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error("REDIS_URL is not a valid URL.");
  }

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(`REDIS_URL must use redis: or rediss:, got ${parsed.protocol}`);
  }

  // A path component is the database index. Providers that do not support
  // selection leave it empty.
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: parsed.protocol === "rediss:",
    db: Number.isFinite(db) ? db : 0,
  };
}

/** Shared options so the producer and the worker connect identically. */
export const BULLMQ_CONNECTION_OPTIONS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
} as const;
