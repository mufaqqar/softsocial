/**
 * A plain Prisma client for CLI scripts.
 *
 * `src/lib/db.ts` imports "server-only", which only resolves inside a React
 * Server Component graph, so scripts build their own client with the same
 * driver adapter configuration.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
  log: ["warn", "error"],
});
