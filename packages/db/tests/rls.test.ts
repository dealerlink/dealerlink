/**
 * RLS isolation smoke test.
 *
 * Connects to the dev database as `dealerlink_app` (the NOBYPASSRLS role) and
 * asserts that switching the `app.tenant_id` GUC only exposes that tenant's
 * rows. Run after `pnpm db:migrate` and `pnpm db:seed`.
 *
 * Phase 1 takes the pragmatic path of testing against the running dev DB.
 * Phase 2+ should swap this for testcontainers-postgres so the test is fully
 * hermetic and runs in CI.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

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

describe('RLS isolation', () => {
  it('demo tenant sees only demo users', async () => {
    const [demo] = await db
      .select()
      .from(tenants)
      .where(sql`slug = 'demo'`);
    expect(demo).toBeDefined();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demo!.id}, true)`);
      return tx.select({ email: users.email }).from(users);
    });
    expect(rows.every((r) => r.email.endsWith('@demo.test'))).toBe(true);
    expect(rows.length).toBe(4);
  });

  it('sample tenant sees only sample users', async () => {
    const [sample] = await db
      .select()
      .from(tenants)
      .where(sql`slug = 'sample'`);
    expect(sample).toBeDefined();
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${sample!.id}, true)`);
      return tx.select({ email: users.email }).from(users);
    });
    expect(rows.every((r) => r.email.endsWith('@sample.test'))).toBe(true);
    expect(rows.length).toBe(4);
  });

  it('no tenant context sees only platform operators', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
      return tx.select({ email: users.email }).from(users);
    });
    expect(rows.every((r) => r.email === 'operator@dealerlink.test')).toBe(true);
  });
});
