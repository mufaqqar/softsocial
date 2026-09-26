import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. On Supabase this is the
    // "Direct connection" string; at runtime the app uses the pooled DATABASE_URL.
    url: env(process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL"),
  },
});
