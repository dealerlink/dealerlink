'use server';

import { accessLog, db, tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireRole } from '@/lib/auth/require-role';
import { AppError } from '@/lib/errors';

const IMPERSONATION_COOKIE = 'dealerlink_impersonation';
const IMPERSONATION_TTL_S = 60 * 60; // 1 hour

/**
 * In production the operator console (app./admin.dealerlink.in) and the tenant
 * workspaces (<slug>.dealerlink.in) are DIFFERENT hosts. A host-only cookie set
 * on the operator host would NOT be sent to the tenant subdomain, so the
 * operator would land on the tenant app with no impersonation cookie → bounced
 * to /admin → bounced to the tenant login = dead end (the bug this fixes).
 *
 * Scope the cookie to the registrable apex `.dealerlink.in` — exactly like the
 * Lucia session cookie (lib/auth/lucia.ts) — so it travels across subdomains.
 * In dev everything is on localhost (one host), so no domain is needed.
 */
const COOKIE_DOMAIN = process.env.NODE_ENV === 'production' ? '.dealerlink.in' : undefined;

function impersonationCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
  };
}

function clientMeta() {
  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  const userAgent = h.get('user-agent') ?? null;
  return { ip, userAgent };
}

/**
 * Operator enters a tenant's workspace in read-only mode. Sets a cookie
 * carrying the tenant_id; the (app) shell reads it, shows a banner, and the
 * tenantAction wrapper enforces read-only on every mutation.
 */
export async function enterImpersonation(tenantId: string): Promise<void> {
  const auth = await requireRole(['operator']);

  const [tenant] = await db
    .select({ id: tenants.id, slug: tenants.slug })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found');

  const { ip, userAgent } = clientMeta();

  // Audit the entry event
  await db.insert(accessLog).values({
    tenantId: tenant.id,
    userId: auth.user.id,
    entityType: 'tenant',
    entityId: tenant.id,
    action: 'operator_impersonation_view',
    ip,
    userAgent,
  });

  cookies().set(IMPERSONATION_COOKIE, tenant.id, {
    ...impersonationCookieOptions(),
    maxAge: IMPERSONATION_TTL_S,
  });

  // In dev, route via ?tenant=<slug> (no subdomains). In prod/staging, point at
  // the tenant subdomain. The apex MUST come from NEXT_PUBLIC_APP_DOMAIN, not a
  // hardcoded `dealerlink.in`: staging also runs NODE_ENV=production but its
  // apex is `staging.dealerlink.in`, so a hardcoded apex would send the
  // operator to the PRODUCTION subdomain (`demo.dealerlink.in`) instead of
  // `demo.staging.dealerlink.in`. Mirrors apexDomain() in lib/tenant/resolve.ts.
  if (process.env.NODE_ENV === 'production') {
    const apex = (process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'dealerlink.in').toLowerCase();
    redirect(`https://${tenant.slug}.${apex}/dashboard`);
  }
  redirect(`/dashboard?tenant=${tenant.slug}`);
}

/**
 * Clears the impersonation cookie and sends the operator back to /admin.
 */
export async function exitImpersonation(): Promise<void> {
  // Anyone holding the cookie can clear it — but require auth so we audit.
  const auth = await requireRole(['operator']);

  // Audit the exit event (best-effort) before clearing the cookie. Together
  // with the entry event this bounds each operator viewing session in the
  // access log: who viewed which tenant, from when to when.
  const tenantId = cookies().get(IMPERSONATION_COOKIE)?.value ?? null;
  if (tenantId) {
    const { ip, userAgent } = clientMeta();
    try {
      await db.insert(accessLog).values({
        tenantId,
        userId: auth.user.id,
        entityType: 'tenant',
        entityId: tenantId,
        action: 'operator_impersonation_exit',
        ip,
        userAgent,
      });
    } catch {
      // Access logging must never block the operator from exiting.
    }
  }

  // A domain-scoped cookie must be deleted with the SAME domain attribute, or
  // the browser keeps the original. Mirror enterImpersonation's options.
  cookies().set(IMPERSONATION_COOKIE, '', {
    ...impersonationCookieOptions(),
    maxAge: 0,
  });
  redirect('/admin');
}
