/**
 * Audit log pipeline: insert, update, delete; redaction; IP/UA propagation.
 *
 * Runs as the app role so RLS is enforced. We set app.tenant_id + app.user_id
 * + app.request_ip + app.request_ua before each mutation, then assert
 * audit_log captured the right shape.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import { auditLog, tenants, users } from '../src/schema';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;
let actingUserId: string;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 1, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, 'demo'));
  if (!t) throw new Error('demo tenant missing — run pnpm db:seed');
  demoId = t.id;
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoId}, true)`);
    return tx.select({ id: users.id }).from(users).where(eq(users.email, 'admin@demo.test'));
  });
  if (!rows[0]) throw new Error('admin@demo.test missing');
  actingUserId = rows[0].id;
}, 30_000);

afterAll(async () => {
  await client.end({ timeout: 5 });
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withCtx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${actingUserId}, true)`);
    await tx.execute(sql`SELECT set_config('app.request_ip', '203.0.113.7', true)`);
    await tx.execute(sql`SELECT set_config('app.request_ua', 'Mozilla/test', true)`);
    return fn(tx);
  });
}

async function findAudit(entityId: string, action: 'insert' | 'update' | 'delete') {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoId}, true)`);
    const [row] = await tx
      .select()
      .from(auditLog)
      .where(sql`entity_type = 'users' AND entity_id = ${entityId} AND action = ${action}`);
    return row;
  });
}

describe('audit_log trigger', () => {
  it('writes an insert row with before=null, after=row, password_hash redacted', async () => {
    const email = `audit-insert-${Date.now()}@demo.test`;
    const inserted = await withCtx((tx) =>
      tx
        .insert(users)
        .values({
          tenantId: demoId,
          email,
          passwordHash: 'super-secret-hash',
          role: 'sales',
          fullName: 'Audit Insert',
          status: 'active',
        })
        .returning({ id: users.id }),
    );
    const newId = inserted[0]!.id;

    try {
      const row = await findAudit(newId, 'insert');
      expect(row).toBeTruthy();
      expect(row!.before).toBeNull();
      const after = row!.after as Record<string, unknown>;
      expect(after['email']).toBe(email);
      expect(after['password_hash']).toBe('[redacted]');
      expect(row!.changedBy).toBe(actingUserId);
      expect(row!.ip).toBe('203.0.113.7');
      expect(row!.userAgent).toBe('Mozilla/test');
    } finally {
      await withCtx((tx) => tx.delete(users).where(eq(users.id, newId)));
    }
  }, 20_000);

  it('writes an update row with before+after diff, password_hash redacted on both sides', async () => {
    const email = `audit-update-${Date.now()}@demo.test`;
    const inserted = await withCtx((tx) =>
      tx
        .insert(users)
        .values({
          tenantId: demoId,
          email,
          passwordHash: 'hash-v1',
          role: 'sales',
          fullName: 'Audit Update',
          status: 'active',
        })
        .returning({ id: users.id }),
    );
    const newId = inserted[0]!.id;
    try {
      await withCtx((tx) =>
        tx
          .update(users)
          .set({ passwordHash: 'hash-v2', fullName: 'Audit Update v2' })
          .where(eq(users.id, newId)),
      );
      const row = await findAudit(newId, 'update');
      expect(row).toBeTruthy();
      const before = row!.before as Record<string, unknown>;
      const after = row!.after as Record<string, unknown>;
      expect(before['full_name']).toBe('Audit Update');
      expect(after['full_name']).toBe('Audit Update v2');
      expect(before['password_hash']).toBe('[redacted]');
      expect(after['password_hash']).toBe('[redacted]');
    } finally {
      await withCtx((tx) => tx.delete(users).where(eq(users.id, newId)));
    }
  }, 20_000);

  it('writes a delete row with before=row, after=null', async () => {
    const email = `audit-delete-${Date.now()}@demo.test`;
    const inserted = await withCtx((tx) =>
      tx
        .insert(users)
        .values({
          tenantId: demoId,
          email,
          passwordHash: 'will-be-redacted',
          role: 'sales',
          fullName: 'Audit Delete',
          status: 'active',
        })
        .returning({ id: users.id }),
    );
    const newId = inserted[0]!.id;
    await withCtx((tx) => tx.delete(users).where(eq(users.id, newId)));

    const row = await findAudit(newId, 'delete');
    expect(row).toBeTruthy();
    expect(row!.after).toBeNull();
    const before = row!.before as Record<string, unknown>;
    expect(before['email']).toBe(email);
    expect(before['password_hash']).toBe('[redacted]');
  }, 20_000);
});
