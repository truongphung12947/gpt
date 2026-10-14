import { Pool } from "pg";

// One pool per server process. DATABASE_URL points at Azure Database for PostgreSQL
// (…?sslmode=require); locally it can be a plain Postgres.
declare global {
  var __pgPool: Pool | undefined;
  var __pgReady: Promise<void> | undefined;
}

const pool = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (globalThis.__pgPool ??= new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  }));
};

/** Runs a query, creating the schema first on a fresh database. */
export const query = async <T extends object = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
) => {
  const p = pool();
  globalThis.__pgReady ??= p
    .query(
      `create table if not exists chats (
         thread_id  uuid primary key,
         owner      text not null,
         title      text,
         archived   boolean not null default false,
         created_at timestamptz not null default now(),
         updated_at timestamptz not null default now()
       );
       create index if not exists chats_owner_updated on chats (owner, updated_at desc);`,
    )
    .then(() => undefined);
  try {
    await globalThis.__pgReady;
  } catch (e) {
    globalThis.__pgReady = undefined; // retry next time
    throw e;
  }
  return (await p.query<T>(text, params)).rows;
};
