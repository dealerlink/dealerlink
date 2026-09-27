/**
 * F.5a — `dealer_addresses`: RLS, the tenant-isolation policy, the CHECK
 * constraints, the FK behaviour, and the audit trigger.
 *
 * ## THIS FILE IS THE ONLY THING THAT WOULD CATCH AN OMITTED POLICY, AND IT WAS
 * ## WRITTEN BEFORE THE POLICY EXISTED, ON PURPOSE
 *
 * F.5a's P-8 established that three things are needed for a new table and only
 * ONE of them is automatic. `packages/db/src/migrate.ts:48-58` applies every
 * `.sql` in `rls/` and then every `.sql` in `triggers/`, and
 * `rls/00-app-role.sql:43-54` re-grants on ALL TABLES — so GRANTS come for free.
 * **RLS does not.** It needs a new `rls/dealer-addresses.sql`. **The audit trigger
 * does not.** It needs a stanza in `triggers/audit-log.sql`.
 *
 * And nothing would have noticed either omission. The existing RLS metadata
 * assertions are hand-written `it.each` lists — `rls.test.ts:88-102` names six
 * tables, `dealers.test.ts:50-60` names four — so a new table simply is not in
 * them. There is no coverage test that enumerates tables and demands a policy.
 * A table added without a policy would ship readable across every tenant, and
 * the whole suite would stay green.
 *
 * So this file was written and RUN AGAINST THE MIGRATION BEFORE THE POLICY FILE
 * EXISTED, and it failed — the ENABLE, FORCE, policy-existence and cross-tenant
 * assertions all went red together. Then the policy landed and they went green.
 * That red run is the evidence that isolation here is REAL rather than ASSUMED;
 * a suite that has only ever been green cannot distinguish the two. The failure
 * output is in the day's deviation entry (DEV.138 — a passing negative result is
 * not evidence until something demonstrates it could have failed).
 *
 * ## THE CROSS-TENANT ASSERTION CARRIES ITS OWN CONTROL
 *
 * "Tenant B sees zero rows" passes just as well when the table is empty, when
 * the query is broken, or when the connection is wrong. So every isolation case
 * below asserts BOTH halves against the same data: the owning tenant sees its own
 * row, and the other tenant sees none. Only the pair is evidence.
 */
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import { auditLog, dealerAddresses, dealers, tenants } from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

/**
 * The APP role — `NOLOGIN NOBYPASSRLS`. Every isolation assertion must run as
 * this role: the owner role bypasses RLS, so the same test connected as owner
 * would pass with no policy at all and prove nothing.
 */
const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId = '';
let sampleId = '';
let demoDealerId = '';

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const rows = await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants);
  demoId = rows.find((r) => r.slug === 'demo')?.id ?? '';
  sampleId = rows.find((r) => r.slug === 'sample')?.id ?? '';
  if (!demoId || !sampleId) throw new Error('demo and sample tenants required — run pnpm db:seed');
  // A dealer with NO seeded addresses, chosen deliberately rather than "the first
  // dealer". `seeds/dealer-addresses.ts` gives the first three dealers per tenant a
  // DEFAULT address, so picking the first would make the one-default constraint
  // case collide with seeded data — which it did, until this was changed. The test
  // owns its own dealer, so it stays correct when the seed's coverage changes.
  const [d] = await asTenant(demoId, (tx) =>
    tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(sql`NOT EXISTS (SELECT 1 FROM dealer_addresses da WHERE da.dealer_id = dealers.id)`)
      .orderBy(dealers.dealerCode)
      .limit(1),
  );
  if (!d) {
    throw new Error(
      'demo has no dealer without addresses — seeds/dealer-addresses.ts now covers every ' +
        'dealer, so this test needs its own dealer rather than borrowing one',
    );
  }
  demoDealerId = d.id;
});

afterAll(async () => {
  // Clean up only what this file created, identified by its own label prefix.
  // A blanket delete would remove rows another test or the seed owns.
  try {
    await asTenant(demoId, (tx) => tx.delete(dealerAddresses).where(sql`label LIKE 'F5A-TEST-%'`));
  } finally {
    await client?.end({ timeout: 5 });
  }
});

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

/** Insert one address for demo's first dealer, labelled so cleanup can find it. */
async function insertDemoAddress(label: string, state = 'MH'): Promise<string> {
  const [row] = await asTenant(demoId, (tx) =>
    tx
      .insert(dealerAddresses)
      .values({
        tenantId: demoId,
        dealerId: demoDealerId,
        label,
        addressLine1: 'Plot 14, MIDC Industrial Area',
        city: 'Pune',
        state,
        pincode: '411019',
      })
      .returning({ id: dealerAddresses.id }),
  );
  if (!row) throw new Error('insert returned nothing');
  return row.id;
}

describe('dealer_addresses — RLS metadata', () => {
  it('has RLS ENABLED and FORCED', async () => {
    // FORCE matters separately from ENABLE: without it, the table OWNER bypasses
    // the policy, and the seed and migrations run as owner. `rls/dealers.sql`
    // sets both, so this asserts both.
    const [row] = await db.execute(
      sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'dealer_addresses'`,
    );
    const r = row as { relrowsecurity: boolean; relforcerowsecurity: boolean } | undefined;
    expect(r, 'dealer_addresses must exist — run pnpm db:migrate').toBeDefined();
    expect(r!.relrowsecurity, 'ROW LEVEL SECURITY must be ENABLED').toBe(true);
    expect(r!.relforcerowsecurity, 'ROW LEVEL SECURITY must be FORCED').toBe(true);
  });

  it('carries a tenant_isolation policy with both USING and WITH CHECK', async () => {
    // Named affirmatively rather than "at least one policy exists": a policy with
    // the wrong name, or with USING but no WITH CHECK, would let a tenant WRITE a
    // row belonging to another tenant while being unable to read it.
    const rows = (await db.execute(
      sql`SELECT policyname, qual, with_check FROM pg_policies
          WHERE tablename = 'dealer_addresses'`,
    )) as unknown as { policyname: string; qual: string | null; with_check: string | null }[];
    expect(rows.map((r) => r.policyname)).toEqual(['tenant_isolation']);
    expect(rows[0]!.qual, 'USING clause').toContain('app_current_tenant()');
    expect(rows[0]!.with_check, 'WITH CHECK clause').toContain('app_current_tenant()');
  });
});

describe('dealer_addresses — tenant isolation, with its own control', () => {
  it('the owning tenant sees its row and the other tenant sees none', async () => {
    const id = await insertDemoAddress('F5A-TEST-isolation');

    const mine = await asTenant(demoId, (tx) =>
      tx
        .select({ id: dealerAddresses.id })
        .from(dealerAddresses)
        .where(sql`id = ${id}`),
    );
    const theirs = await asTenant(sampleId, (tx) =>
      tx
        .select({ id: dealerAddresses.id })
        .from(dealerAddresses)
        .where(sql`id = ${id}`),
    );

    // Both halves, against the same row. Either alone proves nothing: the first
    // would pass with RLS off, the second would pass with a broken query.
    expect(
      mine.map((r) => r.id),
      'demo must see its own address',
    ).toEqual([id]);
    expect(theirs, 'sample must not see demo rows').toEqual([]);
  });

  it('a tenant cannot INSERT a row belonging to another tenant', async () => {
    // This is what WITH CHECK buys, and it fails differently from a read leak —
    // the row is created and simply invisible to its creator, which is worse.
    await expect(
      asTenant(sampleId, (tx) =>
        tx.insert(dealerAddresses).values({
          tenantId: demoId,
          dealerId: demoDealerId,
          label: 'F5A-TEST-cross-tenant-write',
          addressLine1: 'Should not be insertable',
          city: 'Pune',
          state: 'MH',
          pincode: '411019',
        }),
      ),
    ).rejects.toThrow();
  });
});

describe('dealer_addresses — constraints', () => {
  it('rejects a state that is not a 2-letter uppercase code', async () => {
    for (const bad of ['Maharashtra', 'mh', 'M', 'MHX', '']) {
      await expect(
        insertDemoAddress(`F5A-TEST-badstate-${bad || 'empty'}`, bad),
        `state ${JSON.stringify(bad)} must be rejected`,
      ).rejects.toThrow();
    }
  });

  it('accepts a valid code — the control for the case above', async () => {
    // Without this, the rejections above would pass even if EVERY insert failed
    // for an unrelated reason.
    await expect(insertDemoAddress('F5A-TEST-goodstate', 'GA')).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects a blank label and a blank address line', async () => {
    await expect(
      asTenant(demoId, (tx) =>
        tx.insert(dealerAddresses).values({
          tenantId: demoId,
          dealerId: demoDealerId,
          label: '   ',
          addressLine1: 'x',
          city: 'Pune',
          state: 'MH',
          pincode: '411019',
        }),
      ),
    ).rejects.toThrow();
    await expect(
      asTenant(demoId, (tx) =>
        tx.insert(dealerAddresses).values({
          tenantId: demoId,
          dealerId: demoDealerId,
          label: 'F5A-TEST-blank-line1',
          addressLine1: '  ',
          city: 'Pune',
          state: 'MH',
          pincode: '411019',
        }),
      ),
    ).rejects.toThrow();
  });

  it('allows at most one default per dealer, and a soft-deleted default frees the slot', async () => {
    const first = await insertDemoAddress('F5A-TEST-default-a');
    await asTenant(demoId, (tx) =>
      tx
        .update(dealerAddresses)
        .set({ isDefault: true })
        .where(sql`id = ${first}`),
    );
    const second = await insertDemoAddress('F5A-TEST-default-b');
    await expect(
      asTenant(demoId, (tx) =>
        tx
          .update(dealerAddresses)
          .set({ isDefault: true })
          .where(sql`id = ${second}`),
      ),
      'a second default must be rejected',
    ).rejects.toThrow();

    // Soft-deleting the first must free the slot — the partial index is on
    // `deleted_at IS NULL` precisely so this works. Without that predicate the
    // failure would look like a form bug rather than a deleted row.
    await asTenant(demoId, (tx) =>
      tx
        .update(dealerAddresses)
        .set({ deletedAt: new Date() })
        .where(sql`id = ${first}`),
    );
    await expect(
      asTenant(demoId, (tx) =>
        tx
          .update(dealerAddresses)
          .set({ isDefault: true })
          .where(sql`id = ${second}`),
      ),
    ).resolves.toBeDefined();
  });

  it('refuses to delete a dealer that still has an address (onDelete: restrict)', async () => {
    await insertDemoAddress('F5A-TEST-fk-restrict');
    await expect(
      asTenant(demoId, (tx) => tx.delete(dealers).where(sql`id = ${demoDealerId}`)),
    ).rejects.toThrow();
  });
});

describe('dealer_addresses — audit trigger', () => {
  it('writes an audit_log row on insert', async () => {
    // Asserted directly because the trigger stanza in triggers/audit-log.sql is
    // NOT automatic and, like the policy, nothing else in the suite would notice
    // its absence (P-8). CLAUDE.md §7: audit rows come from triggers, never from
    // application code — so if this passes, it passes for the right reason.
    const label = `F5A-TEST-audit-${Date.now()}`;
    const id = await insertDemoAddress(label);
    const rows = await asTenant(demoId, (tx) =>
      tx
        .select({ action: auditLog.action, entityId: auditLog.entityId })
        .from(auditLog)
        .where(sql`entity_type = 'dealer_addresses' AND entity_id = ${id}`),
    );
    expect(
      rows.map((r) => r.action),
      `no audit row for dealer_addresses/${id}`,
      // LOWERCASE, and asserted exactly rather than case-insensitively: the writer
      // stores `lower(TG_OP)` (triggers/audit-log.sql:142), so 'insert' IS the
      // contract. A case-insensitive match here would pass if that ever changed,
      // which is the opposite of what this assertion is for.
    ).toContain('insert');
  });
});
