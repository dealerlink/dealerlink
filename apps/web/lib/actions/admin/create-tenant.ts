'use server';

import { randomUUID } from 'node:crypto';

import { tenantSettings, tenants, users } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';

import { operatorAction } from '@/lib/actions/wrap';
import { DEFAULT_DOC_PREFIXES } from '@/lib/admin/constants';
import {
  generateInboundToken,
  generateTemporaryPassword,
  tenantLoginUrl,
} from '@/lib/admin/credentials';
import { createTenantSchema } from '@/lib/admin/schemas';
import { hashPassword } from '@/lib/auth/password';
import { queueEmail } from '@/lib/email/send';
import { renderTenantWelcome } from '@/lib/email/templates/tenant-welcome';
import { AppError } from '@/lib/errors';

/**
 * Provision a new tenant. Single transaction:
 *
 *   1. Slug uniqueness check (case-insensitive)
 *   2. Insert tenant row (audit trigger fires)
 *   3. Insert tenant_settings with all form values + the §16 defaults +
 *      a fresh inbound email token
 *   4. Insert admin user (must_change_password = true) with a generated
 *      12-char temporary password
 *   5. Insert an `email_delivery_log` row with status='queued' so the
 *      worker (or dev fallback) can pick it up and send the welcome email
 *
 * Returns enough info for the operator UI to display credentials once and
 * never again (we don't store plaintext passwords beyond this round-trip).
 */
export const createTenant = operatorAction(createTenantSchema, async ({ tx, input }) => {
  // Case-insensitive slug uniqueness check. The unique index will also
  // catch this, but we want a friendly error before the partial INSERT.
  const conflict = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(sql`lower(${tenants.slug})`, input.slug))
    .limit(1);
  if (conflict.length > 0) {
    throw new AppError('CONFLICT', `Slug "${input.slug}" is already in use`);
  }

  const tenantId = randomUUID();
  const inboundToken = generateInboundToken();
  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);

  // 1. tenants — no RLS, audit trigger writes via TG_TABLE_NAME='tenants'
  await tx.insert(tenants).values({
    id: tenantId,
    slug: input.slug,
    legalName: input.legalName,
    displayName: input.displayName,
    status: 'active',
  });

  // The audit trigger reads `app.tenant_id` to attach changes to. For
  // operator-driven creation, withOperator() leaves it empty. Set it now
  // so the tenant_settings + users INSERTs that follow get audited under
  // the new tenant id rather than getting skipped.
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);

  // 2. tenant_settings
  await tx.insert(tenantSettings).values({
    tenantId,
    gstin: input.gstin,
    pan: input.pan,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 || null,
    addressCity: input.addressCity,
    addressState: input.addressState,
    addressPincode: input.addressPincode,
    addressCountry: 'IN',
    state: input.state,
    bankName: input.bankAccountName,
    bankAccountNumber: input.bankAccountNumber,
    bankIfsc: input.bankIfsc,
    bankBranch: input.bankBranch,
    docPrefixes: { ...DEFAULT_DOC_PREFIXES },
    fiscalYearStart: 4,
    defaultCurrency: 'INR',
    defaultLocale: 'en-IN',
    defaultQuoteValidity: 30,
    defaultCreditPeriod: 30,
    lowStockThreshold: 5,
    inboundEmailToken: inboundToken,
  });

  // 3. admin user — must rotate password on first login
  const adminUserId = randomUUID();
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

  const loginUrl = tenantLoginUrl(input.slug);

  // 4. Queue the welcome email (R.13 — async via pg-boss). The welcome
  // template is rendered now; `queueEmail` stores the HTML in the
  // email_delivery_log row and enqueues the `send-email` job. The email
  // worker drops the rendered body (which carries the temporary password)
  // from `meta` once the send succeeds.
  const welcome = renderTenantWelcome({
    tenantDisplayName: input.displayName,
    adminFullName: input.adminFullName,
    adminEmail: input.adminEmail,
    loginUrl,
    temporaryPassword: tempPassword,
  });
  await queueEmail(tx, {
    tenantId,
    to: input.adminEmail,
    subject: welcome.subject,
    html: welcome.html,
    text: welcome.text,
    template: 'tenant-welcome',
    extraMeta: { tenantSlug: input.slug },
  });

  return {
    tenantId,
    slug: input.slug,
    displayName: input.displayName,
    adminEmail: input.adminEmail,
    adminUserId,
    loginUrl,
    // The operator UI shows this once and we never store it in plaintext
    // anywhere else (the meta column above is queue payload only).
    temporaryPassword: tempPassword,
  };
});
