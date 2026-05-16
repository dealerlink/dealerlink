'use server';

import { randomUUID } from 'node:crypto';

import { sessions, tenants, users, type DrizzleTx } from '@dealerlink/db';
import { and, eq, sql } from 'drizzle-orm';

import { operatorAction } from '@/lib/actions/wrap';
import { generateTemporaryPassword, tenantLoginUrl } from '@/lib/admin/credentials';
import {
  createTenantUserSchema,
  tenantIdAndUserSchema,
  updateTenantUserSchema,
} from '@/lib/admin/schemas';
import { hashPassword } from '@/lib/auth/password';
import { queueEmail } from '@/lib/email/send';
import { renderTenantWelcome } from '@/lib/email/templates/tenant-welcome';
import { AppError } from '@/lib/errors';

async function loadTenant(tx: DrizzleTx, tenantId: string) {
  const [row] = await tx
    .select({ id: tenants.id, slug: tenants.slug, displayName: tenants.displayName })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND', 'Tenant not found');
  return row;
}

async function bindTenantContext(tx: DrizzleTx, tenantId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
}

/**
 * Create a tenant user. The operator passes an explicit tenantId; we then
 * bind the tenant context inside the transaction so RLS allows the INSERT
 * and the audit trigger attaches to the correct tenant.
 */
export const createTenantUser = operatorAction(createTenantUserSchema, async ({ tx, input }) => {
  const tenant = await loadTenant(tx, input.tenantId);
  await bindTenantContext(tx, tenant.id);

  // Duplicate email within tenant?
  const [existing] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.email, input.email)))
    .limit(1);
  if (existing) {
    throw new AppError('CONFLICT', 'A user with that email already exists for this tenant');
  }

  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);
  const newUserId = randomUUID();

  await tx.insert(users).values({
    id: newUserId,
    tenantId: tenant.id,
    email: input.email,
    passwordHash,
    role: input.role,
    fullName: input.fullName,
    status: 'active',
    mustChangePassword: true,
  });

  const loginUrl = tenantLoginUrl(tenant.slug);
  const welcome = renderTenantWelcome({
    tenantDisplayName: tenant.displayName,
    adminFullName: input.fullName,
    adminEmail: input.email,
    loginUrl,
    temporaryPassword: tempPassword,
  });
  await queueEmail(tx, {
    tenantId: tenant.id,
    to: input.email,
    subject: `Dealerlink — your ${tenant.displayName} account`,
    html: welcome.html,
    text: welcome.text,
    template: 'tenant-welcome',
    extraMeta: { tenantSlug: tenant.slug },
  });

  return {
    userId: newUserId,
    tenantId: tenant.id,
    email: input.email,
    temporaryPassword: tempPassword,
    loginUrl,
  };
});

export const updateTenantUser = operatorAction(updateTenantUserSchema, async ({ tx, input }) => {
  await bindTenantContext(tx, input.tenantId);
  const [existing] = await tx
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(and(eq(users.tenantId, input.tenantId), eq(users.id, input.userId)))
    .limit(1);
  if (!existing) throw new AppError('NOT_FOUND', 'User not found');

  await tx
    .update(users)
    .set({
      fullName: input.fullName,
      role: input.role,
      status: input.status,
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, input.userId));

  // Suspending a user invalidates their active sessions.
  if (input.status === 'suspended' && existing.status !== 'suspended') {
    await tx.delete(sessions).where(eq(sessions.userId, input.userId));
  }
  return { userId: input.userId };
});

export const deactivateTenantUser = operatorAction(tenantIdAndUserSchema, async ({ tx, input }) => {
  await bindTenantContext(tx, input.tenantId);
  await tx
    .update(users)
    .set({ status: 'suspended', updatedAt: sql`now()` })
    .where(and(eq(users.tenantId, input.tenantId), eq(users.id, input.userId)));
  await tx.delete(sessions).where(eq(sessions.userId, input.userId));
  return { userId: input.userId };
});

export const resetTenantUserPassword = operatorAction(
  tenantIdAndUserSchema,
  async ({ tx, input }) => {
    const tenant = await loadTenant(tx, input.tenantId);
    await bindTenantContext(tx, tenant.id);

    const [user] = await tx
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
      })
      .from(users)
      .where(and(eq(users.tenantId, tenant.id), eq(users.id, input.userId)))
      .limit(1);
    if (!user) throw new AppError('NOT_FOUND', 'User not found');

    const tempPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);

    await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: true,
        updatedAt: sql`now()`,
      })
      .where(eq(users.id, user.id));

    // Wipe all existing sessions so the old credential can't keep them alive.
    await tx.delete(sessions).where(eq(sessions.userId, user.id));

    const loginUrl = tenantLoginUrl(tenant.slug);
    const welcome = renderTenantWelcome({
      tenantDisplayName: tenant.displayName,
      adminFullName: user.fullName,
      adminEmail: user.email,
      loginUrl,
      temporaryPassword: tempPassword,
    });
    await queueEmail(tx, {
      tenantId: tenant.id,
      to: user.email,
      subject: `Dealerlink — your password was reset`,
      html: welcome.html,
      text: welcome.text,
      template: 'tenant-welcome',
      extraMeta: { tenantSlug: tenant.slug, kind: 'password-reset' },
    });

    return {
      userId: user.id,
      email: user.email,
      temporaryPassword: tempPassword,
      loginUrl,
    };
  },
);
