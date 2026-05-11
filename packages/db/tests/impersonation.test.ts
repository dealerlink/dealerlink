/**
 * Operator impersonation: read-only enforcement.
 *
 * The wrap.ts pipeline sets `app.read_only = '1'` on a transaction when an
 * operator is impersonating. The audit trigger raises on any mutation in
 * that state. These tests drive the SQL surface directly to confirm the
 * contract holds, independent of the Server Action wiring.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import { tenants, users } from '../src/schema';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;

beforeAll(() => {
  client = postgres(APP_DB_URL, { max: 1, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

async function getDemoTenantId(): Promise<string> {
  const [t] = await db
    .select()
    .from(tenants)
    .where(sql`slug = 'demo'`);
  if (!t) throw new Error('demo tenant missing — run pnpm db:seed first');
  return t.id;
}

describe('operator impersonation read-only enforcement', () => {
  it('SELECT is allowed in read-only mode', async () => {
    const tenantId = await getDemoTenantId();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      await tx.execute(sql`SELECT set_config('app.read_only', '1', true)`);
      return tx.select({ email: users.email }).from(users);
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('INSERT is rejected by the audit trigger in read-only mode', async () => {
    const tenantId = await getDemoTenantId();
    let caught: unknown = null;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
        await tx.execute(sql`SELECT set_config('app.read_only', '1', true)`);
        await tx.execute(sql`
          INSERT INTO users (tenant_id, email, password_hash, role, full_name, status)
          VALUES (${tenantId}, 'illegal@demo.test', 'x', 'sales', 'Illegal', 'active')
        `);
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeTruthy();
    expect(String(caught)).toContain('read-only context');
  });

  it('UPDATE is rejected in read-only mode', async () => {
    const tenantId = await getDemoTenantId();
    let caught: unknown = null;
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
        await tx.execute(sql`SELECT set_config('app.read_only', '1', true)`);
        await tx.execute(
          sql`UPDATE users SET full_name = 'Hacked' WHERE email = 'admin@demo.test'`,
        );
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeTruthy();
    expect(String(caught)).toContain('read-only context');
  });

  it('mutations resume normally when read_only is cleared', async () => {
    const tenantId = await getDemoTenantId();
    // Round-trip: update + revert.
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
      await tx.execute(sql`UPDATE users SET status = 'active' WHERE email = 'admin@demo.test'`);
    });
  });
});
