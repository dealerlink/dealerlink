/**
 * Post-migration verification for the state-code normalization (DEV.33).
 * Connects with the migration role (bypasses RLS) and asserts every state
 * column holds either NULL or a 2-letter uppercase code. Prints a per-column
 * non-conforming count + a value histogram. Exit 1 if any column is dirty.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL or DATABASE_DIRECT_URL must be set');

const COLUMNS = [
  ['tenant_settings', 'state'],
  ['tenant_settings', 'address_state'],
  ['dealers', 'state'],
  ['quotations', 'tenant_state_at_issue'],
  ['quotations', 'place_of_supply'],
  ['performa_invoices', 'tenant_state_at_issue'],
  ['performa_invoices', 'place_of_supply'],
  ['orders', 'tenant_state_at_issue'],
  ['orders', 'place_of_supply'],
];

const sql = postgres(url, { max: 1, prepare: false });
let dirty = 0;

for (const [table, col] of COLUMNS) {
  const bad = await sql.unsafe(
    `SELECT count(*)::int AS n FROM "${table}" WHERE "${col}" IS NOT NULL AND "${col}" !~ '^[A-Z]{2}$'`,
  );
  const total = await sql.unsafe(`SELECT count(*)::int AS n FROM "${table}"`);
  const distinct = await sql.unsafe(
    `SELECT "${col}" AS v, count(*)::int AS n FROM "${table}" GROUP BY "${col}" ORDER BY v`,
  );
  const histogram = distinct.map((r) => `${r.v ?? 'NULL'}:${r.n}`).join(' ');
  const badN = bad[0].n;
  if (badN > 0) dirty += 1;
  console.log(
    `${badN === 0 ? '✅' : '❌'} ${table}.${col.padEnd(20)} rows=${total[0].n} bad=${badN}  [${histogram}]`,
  );
}

await sql.end({ timeout: 5 });
if (dirty > 0) {
  console.error(`\n✗ ${dirty} column(s) hold non-code values.`);
  process.exit(1);
}
console.log('\n✓ Every state column is NULL or a 2-letter ISO 3166-2:IN code.');
