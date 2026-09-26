/**
 * Creates the PostgreSQL database named in DATABASE_URL if it does not exist.
 *
 * Usage: npm run db:create
 */
import { Client } from "pg";

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!url) {
    console.error("DATABASE_URL or DIRECT_URL is not set.");
    process.exit(1);
  }

  const target = new URL(url);
  const targetName = decodeURIComponent(target.pathname.replace(/^\//, ""));

  const admin = new Client({
    host: target.hostname,
    port: Number(target.port || 5432),
    user: decodeURIComponent(target.username),
    password: decodeURIComponent(target.password),
    database: "postgres",
  });

  await admin.connect();

  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [
    targetName,
  ]);

  if (existing.rowCount) {
    console.log(`Database "${targetName}" already exists.`);
  } else {
    await admin.query(`CREATE DATABASE "${targetName}"`);
    console.log(`Database "${targetName}" created.`);
  }

  await admin.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
