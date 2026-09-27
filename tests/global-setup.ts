import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";

export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://pulse:pulse@localhost:5433/victor_test";
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  try {
    const exists = await sql`select 1 from pg_database where datname = ${dbName}`;
    if (!exists.length) await sql.unsafe(`create database "${dbName.replace(/"/g, "")}"`);
  } catch (err) {
    console.warn("[test-setup] database not reachable; integration tests will fail:", (err as Error).message);
    await sql.end();
    return;
  }
  await sql.end();
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: path.resolve(import.meta.dirname, "../drizzle") });
  await client.end();
}
