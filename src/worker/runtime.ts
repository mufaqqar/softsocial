import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { resolveMediaStorage } from "@/lib/storage/resolve";

/**
 * Runtime singletons for the standalone worker process (master.txt 3.3).
 *
 * These deliberately omit the `server-only` marker used by the app's data layer:
 * `server-only` throws when imported outside a React Server Component bundle,
 * and the worker is a plain Node process. The marker is kept on the app modules
 * so a client component cannot import them by accident.
 */

const globalForWorker = globalThis as unknown as {
  workerPrisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. The worker cannot reach the database.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const workerPrisma = globalForWorker.workerPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForWorker.workerPrisma = workerPrisma;
}

export const workerStorage = resolveMediaStorage();
