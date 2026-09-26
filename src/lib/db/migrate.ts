import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { getDb, closeDb, databaseUrl } from "./client";

export async function runMigrations(url?: string): Promise<void> {
  if (url) process.env.DATABASE_URL = url;
  const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");
  await migrate(getDb(), { migrationsFolder: folder });
}

const isMain = process.argv[1] && /migrate\.(ts|js|mjs)$/.test(process.argv[1]);
if (isMain) {
  const target = databaseUrl().replace(/\/\/[^@]*@/, "//***@");
  runMigrations()
    .then(async () => {
      console.log(`[migrate] done (${target})`);
      await closeDb();
    })
    .catch(async (err: unknown) => {
      console.error("[migrate] failed", err);
      await closeDb();
      process.exit(1);
    });
}
