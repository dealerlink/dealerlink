'use server';

import { accessLog, db, tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { requireRole } from '@/lib/auth/require-role';
import { AppError } from '@/lib/errors';

const IMPERSONATION_COOKIE = 'dealerlink_impersonation';
const IMPERSONATION_TTL_S = 60 * 60; // 1 hour

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
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: IMPERSONATION_TTL_S,
    path: '/',
  });

  // In dev, route via ?tenant=<slug> (no subdomains). In prod, point at the
  // tenant subdomain.
  if (process.env.NODE_ENV === 'production') {
    redirect(`https://${tenant.slug}.dealerlink.in/dashboard`);
  }
  redirect(`/dashboard?tenant=${tenant.slug}`);
}

/**
 * Clears the impersonation cookie and sends the operator back to /admin.
 */
export async function exitImpersonation(): Promise<void> {
  // Anyone holding the cookie can clear it — but require auth so we audit.
  await requireRole(['operator']);
  cookies().delete(IMPERSONATION_COOKIE);
  redirect('/admin');
}
