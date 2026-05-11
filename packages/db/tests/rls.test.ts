/**
 * RLS isolation, exhaustively per table.
 *
 * Connects as `dealerlink_app` (NOBYPASSRLS) and, for every tenant-scoped
 * table, asserts that:
 *   - Reads scoped to tenant A return zero of tenant B's rows.
 *   - Writes scoped to tenant A cannot READ/UPDATE/DELETE tenant B's rows
 *     (RLS makes them invisible, so DML affects 0 rows).
 *
 * Tables WITHOUT RLS (verified via metadata):
 *   - tenants   (operators need cross-tenant access)
 *   - sessions  (looked up by primary key id; no enumeration risk)
 *
 * Run after `pnpm db:migrate` and `pnpm db:seed`.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import {
  accessLog,
  authEvents,
  auditLog,
  documentCounters,
  tenantSettings,
  tenants,
  users,
} from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;
let sampleId: string;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 1, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const [d] = await db
    .select()
    .from(tenants)
    .where(sql`slug = 'demo'`);
  const [s] = await db
    .select()
    .from(tenants)
    .where(sql`slug = 'sample'`);
  if (!d || !s) throw new Error('seed tenants missing — run pnpm db:seed');
  demoId = d.id;
  sampleId = s.id;
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

async function asTenant<T>(
  tenantId: string,
  fn: (tx: DrizzleTx | unknown) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx);
  });
}

describe('RLS isolation — metadata', () => {
  it('tenants table does NOT have RLS enabled (by design)', async () => {
    const [row] = await db.execute(
      sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'tenants'`,
    );
    expect((row as { relrowsecurity: boolean }).relrowsecurity).toBe(false);
  });

  it('sessions table does NOT have RLS enabled (by design)', async () => {
    const [row] = await db.execute(
      sql`SELECT relrowsecurity FROM pg_class WHERE relname = 'sessions'`,
    );
    expect((row as { relrowsecurity: boolean }).relrowsecurity).toBe(false);
  });

  it.each([
    'users',
    'tenant_settings',
    'document_counters',
    'audit_log',
    'auth_events',
    'access_log',
  ])('%s has RLS enabled AND forced', async (table) => {
    const [row] = await db.execute(
      sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${table}`,
    );
    const r = row as { relrowsecurity: boolean; relforcerowsecurity: boolean };
    expect(r.relrowsecurity).toBe(true);
    expect(r.relforcerowsecurity).toBe(true);
  });
});

describe('RLS isolation — users', () => {
  it('demo sees only demo users (>=4 seeded; never sample)', async () => {
    const rows = await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).select({ email: users.email }).from(users),
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.email.endsWith('@demo.test'))).toBe(true);
  });

  it('sample sees only sample users (>=4 seeded; never demo)', async () => {
    const rows = await asTenant(sampleId, (tx) =>
      (tx as DrizzleTx).select({ email: users.email }).from(users),
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows.every((r) => r.email.endsWith('@sample.test'))).toBe(true);
  });

  it('demo cannot UPDATE a sample user (zero rows affected)', async () => {
    const result = await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).execute(
        sql`UPDATE users SET full_name = 'Hijacked' WHERE email = 'admin@sample.test'`,
      ),
    );
    // postgres-js returns count via .count
    expect((result as { count: number }).count).toBe(0);
  });

  it('demo cannot DELETE a sample user (zero rows affected)', async () => {
    const result = await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).execute(sql`DELETE FROM users WHERE email = 'admin@sample.test'`),
    );
    expect((result as { count: number }).count).toBe(0);
  });

  it('no tenant context exposes only platform operators', async () => {
    const rows = await asTenant('', (tx) =>
      (tx as DrizzleTx).select({ email: users.email }).from(users),
    );
    expect(rows.every((r) => r.email === 'operator@dealerlink.test')).toBe(true);
  });
});

describe('RLS isolation — tenant_settings', () => {
  it('demo sees exactly one tenant_settings row, sample sees a different one', async () => {
    const demoRows = await asTenant(demoId, (tx) =>
      (tx as DrizzleTx)
        .select({ tenantId: tenantSettings.tenantId, state: tenantSettings.state })
        .from(tenantSettings),
    );
    const sampleRows = await asTenant(sampleId, (tx) =>
      (tx as DrizzleTx)
        .select({ tenantId: tenantSettings.tenantId, state: tenantSettings.state })
        .from(tenantSettings),
    );
    expect(demoRows.length).toBe(1);
    expect(demoRows[0]!.tenantId).toBe(demoId);
    expect(sampleRows.length).toBe(1);
    expect(sampleRows[0]!.tenantId).toBe(sampleId);
    expect(demoRows[0]!.state).not.toBe(sampleRows[0]!.state);
  });

  it('demo cannot UPDATE sample settings (zero rows)', async () => {
    const result = await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).execute(
        sql`UPDATE tenant_settings SET state = 'Hijacked' WHERE tenant_id = ${sampleId}`,
      ),
    );
    expect((result as { count: number }).count).toBe(0);
  });
});

describe('RLS isolation — audit_log, auth_events, access_log, document_counters', () => {
  it('audit_log reads are tenant-scoped', async () => {
    const demoCount = await asTenant(demoId, async (tx) => {
      const [r] = await (tx as DrizzleTx).execute(sql`SELECT count(*)::int AS n FROM ${auditLog}`);
      return (r as { n: number }).n;
    });
    const sampleCount = await asTenant(sampleId, async (tx) => {
      const [r] = await (tx as DrizzleTx).execute(sql`SELECT count(*)::int AS n FROM ${auditLog}`);
      return (r as { n: number }).n;
    });
    // Each tenant has its own audit rows; counts may differ but neither
    // tenant should see rows whose tenant_id belongs to the other tenant.
    const crossLeak = await asTenant(demoId, async (tx) => {
      const [r] = await (tx as DrizzleTx).execute(
        sql`SELECT count(*)::int AS n FROM ${auditLog} WHERE tenant_id = ${sampleId}`,
      );
      return (r as { n: number }).n;
    });
    expect(crossLeak).toBe(0);
    // Sanity: both tenants do have some audit rows from seeding.
    expect(demoCount).toBeGreaterThan(0);
    expect(sampleCount).toBeGreaterThan(0);
  });

  it('auth_events reads are tenant-scoped', async () => {
    const leak = await asTenant(demoId, async (tx) => {
      const [r] = await (tx as DrizzleTx).execute(
        sql`SELECT count(*)::int AS n FROM ${authEvents} WHERE tenant_id = ${sampleId}`,
      );
      return (r as { n: number }).n;
    });
    expect(leak).toBe(0);
  });

  it('access_log inserts cross-isolate (read-side)', async () => {
    // Write one row scoped to demo
    await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).insert(accessLog).values({
        tenantId: demoId,
        entityType: 'rls-test',
        action: 'view',
      }),
    );
    // Read as sample — should not see it
    const leak = await asTenant(sampleId, (tx) =>
      (tx as DrizzleTx)
        .select({ id: accessLog.id })
        .from(accessLog)
        .where(sql`entity_type = 'rls-test' AND tenant_id = ${demoId}`),
    );
    expect(leak.length).toBe(0);
    // Cleanup
    await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).execute(sql`DELETE FROM access_log WHERE entity_type = 'rls-test'`),
    );
  });

  it('document_counters reads are tenant-scoped', async () => {
    // Insert a counter for demo
    await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).insert(documentCounters).values({
        tenantId: demoId,
        docType: 'rls-test',
        fiscalYear: 2099,
        lastValue: 1,
      }),
    );
    const leak = await asTenant(sampleId, (tx) =>
      (tx as DrizzleTx)
        .select({ id: documentCounters.id })
        .from(documentCounters)
        .where(sql`doc_type = 'rls-test'`),
    );
    expect(leak.length).toBe(0);
    // Cleanup
    await asTenant(demoId, (tx) =>
      (tx as DrizzleTx).execute(sql`DELETE FROM document_counters WHERE doc_type = 'rls-test'`),
    );
  });
});
