/**
 * Day 4 — integration tests for the tenant-provisioning pipeline.
 *
 * The createTenant Server Action lives in the web app (it depends on
 * Next.js request context). These tests exercise the same DB-layer
 * invariants the action relies on, against the real seeded database:
 *
 *   - tenants + tenant_settings + admin user + email_delivery_log are
 *     inserted atomically in a single transaction
 *   - audit_log captures each INSERT
 *   - inbound_token_history rotation works and respects the grace window
 *   - the unique index on tenants.slug rejects duplicates
 *   - RLS isolates a freshly created tenant from a different tenant's app
 *     session
 *
 * Runs against the `dealerlink_app` role (RLS-enforced) so any policy
 * regression fails loudly.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import { hash } from '@node-rs/argon2';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../src/schema';
import {
  auditLog,
  emailDeliveryLog,
  inboundTokenHistory,
  tenantSettings,
  tenants,
  users,
} from '../src/schema';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

const ADMIN_DB_URL =
  process.env.DATABASE_DIRECT_URL ??
  process.env.DATABASE_URL ??
  'postgresql://dealerlink:dev_password_change_me@localhost:5432/dealerlink_dev';

let appClient: ReturnType<typeof postgres>;
let appDb: ReturnType<typeof drizzle>;
let adminClient: ReturnType<typeof postgres>;
let adminDb: ReturnType<typeof drizzle>;

let demoTenantId: string;
let createdTenantIds: string[] = [];

beforeAll(async () => {
  appClient = postgres(APP_DB_URL, { max: 1, prepare: false });
  appDb = drizzle(appClient, { schema, casing: 'snake_case' });
  adminClient = postgres(ADMIN_DB_URL, { max: 1, prepare: false });
  adminDb = drizzle(adminClient, { schema, casing: 'snake_case' });

  const [demo] = await adminDb
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, 'demo'))
    .limit(1);
  if (!demo) throw new Error('demo tenant missing — run pnpm db:seed');
  demoTenantId = demo.id;
}, 30_000);

afterEach(async () => {
  // Clean up any tenants this suite provisioned. Cascades take care of
  // settings, users, audit_log, email_delivery_log, inbound_token_history.
  if (createdTenantIds.length > 0) {
    await adminClient.unsafe(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [createdTenantIds]);
    createdTenantIds = [];
  }
});

afterAll(async () => {
  await appClient.end({ timeout: 5 });
  await adminClient.end({ timeout: 5 });
});

interface ProvisionInput {
  slug: string;
  legalName: string;
  displayName: string;
  state: string;
  gstin: string;
  adminEmail: string;
  adminFullName: string;
  inboundToken?: string;
}

/**
 * Test fixture that mirrors createTenant's transactional shape. Connects
 * as the app role (so RLS is on) and uses the same operator-style
 * approach: app.user_id set, app.tenant_id starts empty then bound to
 * the new tenant for the subsequent inserts.
 */
async function provisionTenant(input: ProvisionInput): Promise<{
  tenantId: string;
  adminUserId: string;
  passwordHash: string;
}> {
  const tenantId = randomUUID();
  const adminUserId = randomUUID();
  const inboundToken = input.inboundToken ?? randomBytes(16).toString('hex');
  const passwordHash = await hash('temp-' + randomUUID().slice(0, 8), {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    algorithm: 2,
  });

  await appDb.transaction(async (tx) => {
    // withOperator() shape: only app.user_id is bound initially
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', '', true)`);

    await tx.insert(tenants).values({
      id: tenantId,
      slug: input.slug,
      legalName: input.legalName,
      displayName: input.displayName,
      status: 'active',
    });

    // Bind tenant context so the upcoming inserts pass RLS WITH CHECK
    // policies and the audit trigger attaches to the right tenant.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);

    await tx.insert(tenantSettings).values({
      tenantId,
      gstin: input.gstin,
      pan: input.gstin.slice(2, 12),
      addressLine1: '1 Test St',
      addressCity: 'Mumbai',
      addressPincode: '400001',
      addressState: input.state,
      state: input.state,
      bankName: 'Test Bank',
      bankAccountNumber: '12345678',
      bankIfsc: 'HDFC0001234',
      bankBranch: 'Test Branch',
      inboundEmailToken: inboundToken,
    });

    await tx.insert(users).values({
      id: adminUserId,
      tenantId,
      email: input.adminEmail,
      passwordHash,
      role: 'admin',
      fullName: input.adminFullName,
      status: 'active',
      mustChangePassword: true,
    });

    await tx.insert(emailDeliveryLog).values({
      tenantId,
      recipient: input.adminEmail,
      subject: `Welcome to Dealerlink — ${input.displayName}`,
      template: 'tenant-welcome',
      status: 'queued',
      meta: { tenantSlug: input.slug, adminFullName: input.adminFullName },
    });
  });

  createdTenantIds.push(tenantId);
  return { tenantId, adminUserId, passwordHash };
}

describe('tenant provisioning — transactional create', () => {
  it('creates tenant + settings + admin user + email_delivery_log atomically', async () => {
    const slug = `t-${Date.now().toString(36)}`;
    const out = await provisionTenant({
      slug,
      legalName: `${slug} Pvt Ltd`,
      displayName: `${slug} Display`,
      state: 'Maharashtra',
      gstin: '27AABCD1234E1Z8',
      adminEmail: `admin@${slug}.test`,
      adminFullName: 'Test Admin',
    });

    const [tenant] = await adminDb
      .select()
      .from(tenants)
      .where(eq(tenants.id, out.tenantId))
      .limit(1);
    expect(tenant?.slug).toBe(slug);
    expect(tenant?.status).toBe('active');

    const [settings] = await adminDb
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, out.tenantId))
      .limit(1);
    expect(settings?.gstin).toBe('27AABCD1234E1Z8');
    expect(settings?.state).toBe('Maharashtra');
    expect(settings?.inboundEmailToken).toBeTruthy();
    expect(settings?.fiscalYearStart).toBe(4);

    const [admin] = await adminDb
      .select()
      .from(users)
      .where(eq(users.id, out.adminUserId))
      .limit(1);
    expect(admin?.email).toBe(`admin@${slug}.test`);
    expect(admin?.role).toBe('admin');
    expect(admin?.mustChangePassword).toBe(true);

    const queue = await adminDb
      .select()
      .from(emailDeliveryLog)
      .where(eq(emailDeliveryLog.tenantId, out.tenantId));
    expect(queue).toHaveLength(1);
    expect(queue[0]?.status).toBe('queued');
    expect(queue[0]?.template).toBe('tenant-welcome');
  }, 30_000);

  it('writes audit rows for tenants + tenant_settings + users INSERTs', async () => {
    const slug = `t-${Date.now().toString(36)}-audit`;
    const out = await provisionTenant({
      slug,
      legalName: `${slug} Pvt Ltd`,
      displayName: `${slug} Display`,
      state: 'Karnataka',
      gstin: '29AABCS9999P1ZY',
      adminEmail: `admin@${slug}.test`,
      adminFullName: 'Audit Admin',
    });

    const rows = await adminDb
      .select({ entityType: auditLog.entityType, action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.tenantId, out.tenantId));

    const types = rows.map((r) => `${r.entityType}:${r.action}`).sort();
    expect(types).toContain('tenants:insert');
    expect(types).toContain('tenant_settings:insert');
    expect(types).toContain('users:insert');
  }, 30_000);

  it('redacts sensitive fields in the audit payload', async () => {
    const slug = `t-${Date.now().toString(36)}-redact`;
    const out = await provisionTenant({
      slug,
      legalName: `${slug} Pvt Ltd`,
      displayName: `${slug} Display`,
      state: 'Maharashtra',
      gstin: '27AABCD1234E1Z8',
      adminEmail: `admin@${slug}.test`,
      adminFullName: 'Redaction Admin',
      inboundToken: 'super-secret-token-must-be-redacted',
    });

    const [settingsAudit] = await adminDb
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, out.tenantId),
          eq(auditLog.entityType, 'tenant_settings'),
          eq(auditLog.action, 'insert'),
        ),
      )
      .limit(1);
    const after = settingsAudit?.after as Record<string, unknown>;
    expect(after['inbound_email_token']).toBe('[redacted]');

    const [userAudit] = await adminDb
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenantId, out.tenantId),
          eq(auditLog.entityType, 'users'),
          eq(auditLog.action, 'insert'),
        ),
      )
      .limit(1);
    const userAfter = userAudit?.after as Record<string, unknown>;
    expect(userAfter['password_hash']).toBe('[redacted]');
  }, 30_000);

  it('rejects duplicate slug via the unique index', async () => {
    const slug = `t-${Date.now().toString(36)}-dup`;
    await provisionTenant({
      slug,
      legalName: 'A Pvt Ltd',
      displayName: 'A',
      state: 'Maharashtra',
      gstin: '27AABCD1234E1Z8',
      adminEmail: `a@${slug}.test`,
      adminFullName: 'A Admin',
    });

    await expect(
      provisionTenant({
        slug, // same slug
        legalName: 'B Pvt Ltd',
        displayName: 'B',
        state: 'Karnataka',
        gstin: '29AABCS9999P1ZY',
        adminEmail: `b@${slug}.test`,
        adminFullName: 'B Admin',
      }),
    ).rejects.toThrow(/tenants_slug_uq|duplicate key|unique/i);
  }, 30_000);
});

describe('tenant provisioning — isolation', () => {
  it('app role with tenant A scope cannot read tenant B settings', async () => {
    const a = await provisionTenant({
      slug: `t-${Date.now().toString(36)}-iso-a`,
      legalName: 'Iso A',
      displayName: 'Iso A',
      state: 'Maharashtra',
      gstin: '27AABCD1234E1Z8',
      adminEmail: `a@iso.test`,
      adminFullName: 'A',
    });
    const b = await provisionTenant({
      slug: `t-${Date.now().toString(36)}-iso-b`,
      legalName: 'Iso B',
      displayName: 'Iso B',
      state: 'Karnataka',
      gstin: '29AABCS9999P1ZY',
      adminEmail: `b@iso.test`,
      adminFullName: 'B',
    });

    const seenB = await appDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${a.tenantId}, true)`);
      return tx
        .select({ id: tenantSettings.id })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, b.tenantId));
    });
    expect(seenB).toEqual([]);

    const seenAuditB = await appDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${a.tenantId}, true)`);
      return tx.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.tenantId, b.tenantId));
    });
    expect(seenAuditB).toEqual([]);
  }, 45_000);

  it('audit_log entries for tenant B never appear in demo tenant queries', async () => {
    const b = await provisionTenant({
      slug: `t-${Date.now().toString(36)}-demo-iso`,
      legalName: 'Demo-iso',
      displayName: 'Demo-iso',
      state: 'Karnataka',
      gstin: '29AABCS9999P1ZY',
      adminEmail: 'iso@demo-iso.test',
      adminFullName: 'Iso',
    });

    const seen = await appDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenantId}, true)`);
      return tx.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.tenantId, b.tenantId));
    });
    expect(seen).toEqual([]);
  }, 30_000);
});

describe('inbound token rotation', () => {
  it('archives the old token with a 7-day expiry on rotation', async () => {
    const out = await provisionTenant({
      slug: `t-${Date.now().toString(36)}-rot`,
      legalName: 'Rot Co',
      displayName: 'Rot Co',
      state: 'Maharashtra',
      gstin: '27AABCD1234E1Z8',
      adminEmail: 'rot@rot.test',
      adminFullName: 'Rot Admin',
      inboundToken: 'original-token-value',
    });

    // Rotate
    await appDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${out.tenantId}, true)`);
      await tx.insert(inboundTokenHistory).values({
        tenantId: out.tenantId,
        token: 'original-token-value',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      await tx
        .update(tenantSettings)
        .set({ inboundEmailToken: 'new-token-value' })
        .where(eq(tenantSettings.tenantId, out.tenantId));
    });

    const history = await adminDb
      .select()
      .from(inboundTokenHistory)
      .where(eq(inboundTokenHistory.tenantId, out.tenantId));
    expect(history).toHaveLength(1);
    expect(history[0]?.token).toBe('original-token-value');
    const expiresInMs = history[0]!.expiresAt.getTime() - Date.now();
    // 7 days ± 1 minute tolerance
    expect(expiresInMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1000 - 60_000);
    expect(expiresInMs).toBeLessThan(7 * 24 * 60 * 60 * 1000 + 60_000);

    const [settings] = await adminDb
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, out.tenantId))
      .limit(1);
    expect(settings?.inboundEmailToken).toBe('new-token-value');
  }, 30_000);

  it('audit_log captures the inbound_token_history INSERT', async () => {
    const out = await provisionTenant({
      slug: `t-${Date.now().toString(36)}-rot-audit`,
      legalName: 'Rot Audit',
      displayName: 'Rot Audit',
      state: 'Maharashtra',
      gstin: '27AABCD1234E1Z8',
      adminEmail: 'rota@rot.test',
      adminFullName: 'Rot A',
      inboundToken: 'will-be-retired',
    });

    await appDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${out.tenantId}, true)`);
      await tx.insert(inboundTokenHistory).values({
        tenantId: out.tenantId,
        token: 'will-be-retired',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    });

    const rows = await adminDb
      .select({ after: auditLog.after })
      .from(auditLog)
      .where(
        and(eq(auditLog.tenantId, out.tenantId), eq(auditLog.entityType, 'inbound_token_history')),
      );
    expect(rows.length).toBeGreaterThan(0);
    const after = rows[0]?.after as Record<string, unknown>;
    // Token must be redacted under the `%_token` audit rule
    expect(after['token']).toBe('[redacted]');
  }, 30_000);
});

describe('email_delivery_log', () => {
  it('is created with status=queued and visible only to its tenant scope', async () => {
    const out = await provisionTenant({
      slug: `t-${Date.now().toString(36)}-mail`,
      legalName: 'Mail Co',
      displayName: 'Mail Co',
      state: 'Maharashtra',
      gstin: '27AABCD1234E1Z8',
      adminEmail: 'mail@mail.test',
      adminFullName: 'Mail Admin',
    });

    // Same tenant scope: row is visible.
    const visible = await appDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${out.tenantId}, true)`);
      return tx.select().from(emailDeliveryLog).where(eq(emailDeliveryLog.tenantId, out.tenantId));
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.status).toBe('queued');

    // Different tenant scope: row is invisible.
    const invisible = await appDb.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenantId}, true)`);
      return tx.select().from(emailDeliveryLog).where(eq(emailDeliveryLog.tenantId, out.tenantId));
    });
    expect(invisible).toEqual([]);
  }, 30_000);
});
