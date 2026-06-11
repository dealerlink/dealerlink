import { db, tenants, tenantSettings, type TenantSettings } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import { AppError } from '@/lib/errors';

import { resolveTenantBySlug, type TenantBrief } from './resolve';

export type TenantContext = {
  tenant: TenantBrief;
  settings: TenantSettings;
  impersonating: boolean;
};

const IMPERSONATION_COOKIE = 'dealerlink_impersonation';

/**
 * Read the resolved tenant slug from the request headers set by middleware.
 * Returns null when the current request is not in tenant scope.
 */
export function currentTenantSlug(): string | null {
  return headers().get('x-dealerlink-tenant-slug');
}

/**
 * Returns the impersonation tenant id from the cookie, or null.
 * Set when an operator clicks "Enter tenant workspace" from the admin app.
 */
export function impersonationTenantId(): string | null {
  return cookies().get(IMPERSONATION_COOKIE)?.value ?? null;
}

/**
 * Absolute URL of the operator console (`/admin`). Cross-subdomain-safe: an
 * operator leaving a tenant workspace is ON the tenant subdomain
 * (`<slug>.dealerlink.in`), where a RELATIVE `/admin` would resolve to
 * `<slug>.dealerlink.in/admin` — a tenant-scoped path that bounces to the
 * tenant login (DEV.82 follow-up: the exit dead-end). In production we send
 * them back to the operator host via NEXT_PUBLIC_APP_URL (e.g.
 * `https://app.dealerlink.in` in prod, `https://staging.dealerlink.in` on
 * staging). In dev everything is one host, so a relative path is correct.
 */
export function operatorAdminUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.dealerlink.in').replace(
      /\/$/,
      '',
    );
    return `${base}/admin`;
  }
  return '/admin';
}

/**
 * Cached per request — returns the tenant + settings for the current scope.
 * Throws `AppError('NOT_FOUND')` if the slug does not resolve to a real
 * tenant. Server Components only.
 */
export const getTenantContext = cache(async (): Promise<TenantContext> => {
  const slug = currentTenantSlug();
  if (!slug) {
    throw new AppError('NOT_FOUND', 'No tenant context for this request');
  }
  const tenant = await resolveTenantBySlug(slug);
  if (!tenant) {
    throw new AppError('NOT_FOUND', `Tenant "${slug}" does not exist`);
  }

  // Settings live in a tenant-scoped table; set RLS context for the read.
  const settings = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
    const [row] = await tx
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenant.id))
      .limit(1);
    return row;
  });

  if (!settings) {
    throw new AppError('NOT_FOUND', `Settings missing for tenant "${tenant.slug}"`);
  }

  const impersonatingId = impersonationTenantId();
  return {
    tenant,
    settings,
    impersonating: impersonatingId === tenant.id,
  };
});

/**
 * Cached per request — same as above but returns null instead of throwing.
 * Use this from layouts that need to gracefully fall back (e.g., (app)
 * layout that should redirect to /login).
 */
export const tryGetTenantContext = cache(async (): Promise<TenantContext | null> => {
  try {
    return await getTenantContext();
  } catch (err) {
    if (err instanceof AppError && err.code === 'NOT_FOUND') return null;
    throw err;
  }
});

/**
 * Cached per request — looks up a tenant by its primary key, no scope
 * needed (uses adminDb-equivalent path: tenants has no RLS). Used by the
 * operator app and impersonation flow.
 */
export const getTenantById = cache(async (tenantId: string): Promise<TenantBrief | null> => {
  const [row] = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      legalName: tenants.legalName,
      displayName: tenants.displayName,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  return row ?? null;
});
