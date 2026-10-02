/**
 * F.6 / F.8 / F.144 — the AUDIT TRIGGER on each of the six new tables.
 *
 * ## WHY THIS FILE EXISTS AT ALL
 *
 * The RLS half is covered automatically: `rls.test.ts` derives its population from
 * `pg_class`, so a tenant-scoped table without ENABLE, FORCE and a
 * `tenant_isolation` policy fails without anyone adding it to a list.
 *
 * **The audit half has no such enumeration.** `triggers/audit-log.sql` is a file of
 * hand-written stanzas — thirty of them now — and no test anywhere derives the set
 * of tables that ought to have one. **A table whose stanza was forgotten looks
 * exactly like a table that has one.** `dealer-address.ts:63-65` records F.5a
 * hitting precisely this, which is why F.6's acceptance criteria were split into 8
 * (automatic) and 9 (not).
 *
 * So each of the six is asserted directly. The list below is a hand-maintained
 * literal and therefore has the same weakness it is testing for — a SEVENTH table
 * added without being listed here is invisible. That is stated rather than hidden,
 * and the general fix (an enumeration over `pg_trigger`, mirroring `rls.test.ts`)
 * is filed rather than built here.
 *
 * CLAUDE.md §7: audit rows come from TRIGGERS, never from application code — so
 * these inserts write no audit row themselves, and a passing assertion passes for
 * the right reason.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';

/** The APP role — NOLOGIN NOBYPASSRLS. The owner bypasses RLS and would prove nothing. */
const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

/** The six tables F.6 added, enumerated. */
const NEW_TABLES = [
  'invoices',
  'invoice_lines',
  'credit_notes',
  'credit_note_lines',
  'debit_notes',
  'debit_note_lines',
] as const;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
});

afterAll(async () => {
  await client?.end({ timeout: 5 });
});

describe('F.6 — the six new tables each have an audit trigger', () => {
  it.each(NEW_TABLES)('%s has an audit_trg AFTER INSERT OR UPDATE OR DELETE', async (table) => {
    const rows = (await db.execute(sql`
      SELECT g.tgname, g.tgtype
      FROM pg_trigger g
      WHERE g.tgrelid = ${sql.raw(`'${table}'`)}::regclass
        AND g.tgname = 'audit_trg'
        AND NOT g.tgisinternal`)) as unknown as { tgname: string; tgtype: number }[];
    expect(rows, `${table} has no audit_trg stanza in triggers/audit-log.sql`).toHaveLength(1);
    // tgtype bits: 1 = ROW, 4 = INSERT, 8 = DELETE, 16 = UPDATE. All three events
    // and FOR EACH ROW, or the trail has holes nobody would notice.
    const t = rows[0]!.tgtype;
    expect(t & 1, `${table}: not FOR EACH ROW`).toBe(1);
    expect(t & 4, `${table}: no INSERT`).toBe(4);
    expect(t & 8, `${table}: no DELETE`).toBe(8);
    expect(t & 16, `${table}: no UPDATE`).toBe(16);
  });

  it('and the RLS half is covered automatically, which is the contrast worth asserting', async () => {
    // Not duplicating rls.test.ts — asserting that the six ARE in its derived
    // population, so the split between criteria 8 and 9 is factual.
    const rows = (await db.execute(sql`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relrowsecurity AND c.relforcerowsecurity
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
            AND a.attnum > 0 AND NOT a.attisdropped)
      ORDER BY c.relname`)) as unknown as { relname: string }[];
    const names = rows.map((r) => r.relname);
    for (const t of NEW_TABLES) expect(names, `${t} not in the RLS population`).toContain(t);
  });
});
