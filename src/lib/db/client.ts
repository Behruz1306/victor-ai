import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const DEFAULT_URL = "postgres://pulse:pulse@localhost:5433/pulse";

type Cache = { sql?: postgres.Sql; db?: Db; url?: string };
// Reuse one pool across Next.js hot reloads and route handler invocations.
const globalCache = globalThis as unknown as { __victorDb?: Cache };

export function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_URL;
}

export function getDb(): Db {
  const cache = (globalCache.__victorDb ??= {});
  const url = databaseUrl();
  if (!cache.db || cache.url !== url) {
    cache.sql = postgres(url, { max: 10, onnotice: () => {} });
    cache.db = drizzle(cache.sql, { schema });
    cache.url = url;
  }
  return cache.db;
}

export async function closeDb(): Promise<void> {
  const cache = globalCache.__victorDb;
  if (cache?.sql) await cache.sql.end({ timeout: 5 });
  globalCache.__victorDb = {};
}

export { schema };
