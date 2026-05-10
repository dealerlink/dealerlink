/**
 * Custom migration runner.
 *
 * 1. Runs Drizzle's auto-generated migrations (schema changes).
 * 2. Applies our hand-written SQL files: RLS helpers, RLS policies,
 *    audit-log triggers. These are idempotent (DROP/CREATE) so
 *    re-running is safe.
 *
 * Used in dev (`pnpm db:migrate`) and on prod deploy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set');
}

function readSqlDir(dir: string): { name: string; sql: string }[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(dir, name), 'utf8') }));
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client);

  console.log('→ Running drizzle migrations from ./migrations');
  await migrate(db, { migrationsFolder: path.resolve(here, '../migrations') });

  console.log('→ Applying RLS helpers + policies');
  for (const { name, sql } of readSqlDir(path.resolve(here, './rls'))) {
    console.log(`  · rls/${name}`);
    await client.unsafe(sql);
  }

  console.log('→ Applying audit-log triggers');
  for (const { name, sql } of readSqlDir(path.resolve(here, './triggers'))) {
    console.log(`  · triggers/${name}`);
    await client.unsafe(sql);
  }

  console.log('✓ Migrations + RLS + triggers applied.');
  await client.end({ timeout: 5 });
}

main().catch((err: unknown) => {
  console.error('✗ Migration failed:', err);
  process.exit(1);
});
