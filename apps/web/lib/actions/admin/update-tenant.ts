'use server';

import { tenantSettings, tenants, type DrizzleTx } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';

import { operatorAction } from '@/lib/actions/wrap';
import {
  updateAddressSchema,
  updateBankSchema,
  updateBrandingSchema,
  updateComplianceSchema,
  updateDefaultsSchema,
  updateDocPrefixesSchema,
  updateIdentitySchema,
} from '@/lib/admin/schemas';
import { AppError } from '@/lib/errors';

/**
 * Each section of the tenant detail page is a separate Server Action so
 * the audit log captures a precise diff per section. All updates run
 * under `withOperator` (no tenant cookie), but we still bind
 * `app.tenant_id` so the audit trigger attaches changes to the right
 * tenant.
 */

async function bindTenantContext(tx: DrizzleTx, tenantId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
}

export const updateTenantIdentity = operatorAction(updateIdentitySchema, async ({ tx, input }) => {
  // Slug uniqueness check (excluding current tenant)
  const dupes = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(sql`lower(${tenants.slug})`, input.slug))
    .limit(1);
  const dupe = dupes[0];
  if (dupe && dupe.id !== input.id) {
    throw new AppError('CONFLICT', `Slug "${input.slug}" is already in use`);
  }

  await bindTenantContext(tx, input.id);
  await tx
    .update(tenants)
    .set({
      slug: input.slug,
      legalName: input.legalName,
      displayName: input.displayName,
      updatedAt: sql`now()`,
    })
    .where(eq(tenants.id, input.id));
  return { id: input.id };
});

export const updateTenantCompliance = operatorAction(
  updateComplianceSchema,
  async ({ tx, input }) => {
    await bindTenantContext(tx, input.id);
    await tx
      .update(tenantSettings)
      .set({
        gstin: input.gstin,
        pan: input.pan,
        state: input.state,
        updatedAt: sql`now()`,
      })
      .where(eq(tenantSettings.tenantId, input.id));
    return { id: input.id };
  },
);

export const updateTenantAddress = operatorAction(updateAddressSchema, async ({ tx, input }) => {
  await bindTenantContext(tx, input.id);
  await tx
    .update(tenantSettings)
    .set({
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 || null,
      addressCity: input.addressCity,
      addressState: input.addressState,
      addressPincode: input.addressPincode,
      updatedAt: sql`now()`,
    })
    .where(eq(tenantSettings.tenantId, input.id));
  return { id: input.id };
});

export const updateTenantBank = operatorAction(updateBankSchema, async ({ tx, input }) => {
  await bindTenantContext(tx, input.id);
  await tx
    .update(tenantSettings)
    .set({
      bankName: input.bankAccountName,
      bankAccountNumber: input.bankAccountNumber,
      bankIfsc: input.bankIfsc,
      bankBranch: input.bankBranch,
      updatedAt: sql`now()`,
    })
    .where(eq(tenantSettings.tenantId, input.id));
  return { id: input.id };
});

export const updateTenantDocPrefixes = operatorAction(
  updateDocPrefixesSchema,
  async ({ tx, input }) => {
    await bindTenantContext(tx, input.id);
    await tx
      .update(tenantSettings)
      .set({
        docPrefixes: input.docPrefixes,
        updatedAt: sql`now()`,
      })
      .where(eq(tenantSettings.tenantId, input.id));
    return { id: input.id };
  },
);

export const updateTenantDefaults = operatorAction(updateDefaultsSchema, async ({ tx, input }) => {
  await bindTenantContext(tx, input.id);
  await tx
    .update(tenantSettings)
    .set({
      defaultQuoteValidity: input.defaultQuoteValidity,
      defaultCreditPeriod: input.defaultCreditPeriod,
      lowStockThreshold: input.lowStockThreshold,
      defaultTerms: input.defaultTerms || null,
      updatedAt: sql`now()`,
    })
    .where(eq(tenantSettings.tenantId, input.id));
  return { id: input.id };
});

export const updateTenantBranding = operatorAction(updateBrandingSchema, async ({ tx, input }) => {
  await bindTenantContext(tx, input.id);
  await tx
    .update(tenantSettings)
    .set({
      logoUrl: input.logoUrl || null,
      primaryColor: input.primaryColor || null,
      updatedAt: sql`now()`,
    })
    .where(eq(tenantSettings.tenantId, input.id));
  return { id: input.id };
});
