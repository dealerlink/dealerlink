/**
 * Final seed step (F.67 Part 2) — pin `created_at` / `updated_at`.
 *
 * The other half of the seed clock. `clock.ts` fixes every date the seeds
 * WRITE; this fixes the ones the database writes for them. `created_at` and
 * `updated_at` default to `now()`, so a reseed moved them on every run —
 * measured at 10:59:36 and then 11:00:05 across two consecutive reseeds of the
 * same document. That reaches a rendered document: `generatedAt` resolves to the
 * source row's `created_at` when no `generated_documents` row exists yet, so the
 * "Generated …" footer moved with it.
 *
 * ── Why a separate pass and not a column on each insert ────────────────────
 *
 * Dispatches are not inserted by the seed at all — day13 creates them through
 * `createDispatchDb`, the SAME production helper the application uses, which is
 * the point: the seed exercises the real path including its `FOR UPDATE`
 * locking. Threading a `createdAt` override through that helper would put a
 * test-only parameter into a protected code path to serve a fixture. Correcting
 * the timestamps afterwards keeps the production path untouched.
 *
 * ── Why business dates rather than one flat value ──────────────────────────
 *
 * Each row's `created_at` is derived from ITS OWN document date — a quotation
 * dated 04-Sept gets a `created_at` on 04-Sept — rather than every row sharing
 * the epoch. Two reasons: rows keep a sane relative order, so anything sorting
 * by `created_at` still behaves; and the footer of a document then agrees with
 * the date printed on its face instead of contradicting it.
 *
 * The time-of-day is fixed at 10:00 UTC (15:30 IST) — inside a working day in
 * the tenant's timezone, and, being a constant, reproducible.
 *
 * NOT covered, deliberately: `audit_log` rows are written by triggers as this
 * pass runs, so their timestamps are wall-clock. Nothing renders them onto a
 * document; making the audit trail itself reproducible is a separate question
 * and is not needed for snapshot testing.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { SEED_EPOCH_ISO } from './clock';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

/** Time of day given to every derived timestamp: 10:00 UTC = 15:30 IST. */
const TIME_OF_DAY = '10:00:00';

/**
 * `[table, date column]`. A null date column means the table has no business
 * date of its own and takes the epoch.
 */
const TABLES: Array<[string, string | null]> = [
  ['quotations', 'quote_date'],
  ['performa_invoices', 'pi_date'],
  ['orders', 'order_date'],
  ['payments', 'received_date'],
  ['dispatches', 'dispatch_date'],
  ['dealers', null],
  ['products', null],
  ['inventory_items', 'procurement_date'],
  ['deals', null],
  ['quotation_lines', null],
  ['performa_invoice_lines', null],
  ['order_lines', null],
  ['dispatch_lines', null],
  ['dispatch_serials', null],
  ['payment_allocations', null],
];

async function main(): Promise<void> {
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client);
  console.log(`→ Pinning created_at/updated_at to the seed clock (${SEED_EPOCH_ISO})`);

  // Which of these tables actually HAVE each column, asked of the database
  // rather than assumed: the line tables carry created_at but no updated_at
  // (payment_allocations carries neither), and a hardcoded list would go stale
  // the next time a migration adds or drops one.
  const cols = (await db.execute(sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public' and column_name in ('created_at', 'updated_at')
  `)) as unknown as Array<{ table_name: string; column_name: string }>;
  const has = new Map<string, Set<string>>();
  for (const r of cols) {
    if (!has.has(r.table_name)) has.set(r.table_name, new Set());
    has.get(r.table_name)!.add(r.column_name);
  }

  let total = 0;
  for (const [table, dateCol] of TABLES) {
    const present = has.get(table) ?? new Set<string>();
    if (present.size === 0) {
      console.log(`  · ${table.padEnd(24)}      — no timestamp columns, skipped`);
      continue;
    }
    // A row's own date at a fixed time of day, or the epoch where it has none.
    //
    // coalesce, because a business date column can be nullable and some rows
    // leave it null — day13's dedicated inventory has no procurement_date, and
    // without the fallback the pass wrote NULL into a NOT NULL column.
    const stamp = dateCol
      ? sql`(coalesce(${sql.raw(dateCol)}, ${SEED_EPOCH_ISO}::date)::timestamp + time '${sql.raw(TIME_OF_DAY)}') at time zone 'UTC'`
      : sql`${SEED_EPOCH_ISO}::timestamptz`;
    const sets = [...present].sort().map((c) => sql`${sql.raw(c)} = ${stamp}`);
    const res = (await db.execute(sql`
      update ${sql.raw(table)}
      set ${sql.join(sets, sql`, `)}
      where ${sql.join(
        [...present].sort().map((c) => sql`${sql.raw(c)} is distinct from ${stamp}`),
        sql` or `,
      )}
    `)) as unknown as { count?: number };
    const n = res.count ?? 0;
    total += n;
    console.log(`  · ${table.padEnd(24)} ${String(n).padStart(6)} rows`);
  }

  console.log(`✓ Pinned ${total} rows.`);
  await client.end({ timeout: 5 });
}

main().catch((err: unknown) => {
  console.error('✗ pin-created-at failed:', err);
  process.exit(1);
});
