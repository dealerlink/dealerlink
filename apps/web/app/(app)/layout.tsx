import { db, tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ImpersonationBanner } from '@/components/shell/ImpersonationBanner';
import { Shell } from '@/components/shell';
import { getAuthContext } from '@/lib/auth/session';
import { currentTenantSlug, impersonationTenantId, operatorAdminUrl } from '@/lib/tenant/context';
import { resolveTenantBySlug } from '@/lib/tenant/resolve';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  // Force-password-change trapdoor (CLAUDE.md §6, ADR-010, DEV.56). A user
  // with the flag set cannot reach any (app) route until they rotate. The
  // check lives here — not in Edge middleware, which cannot resolve a Lucia
  // session (see middleware.ts / DEV.68). /change-password is in the (auth)
  // group, outside this layout, so the redirect never loops.
  if (ctx.user.mustChangePassword) redirect('/change-password');

  const impersonatingId = impersonationTenantId();

  if (ctx.user.role === 'operator') {
    // Operators are only allowed in the tenant shell while impersonating.
    // Use the absolute operator-console URL: this layout runs ON the tenant
    // subdomain, where a relative '/admin' would bounce to the tenant login.
    if (!impersonatingId) redirect(operatorAdminUrl());

    // Slug/cookie consistency (ADR-014). The impersonation cookie is scoped to
    // `.dealerlink.in`, so it travels to EVERY tenant subdomain. When the
    // request carries a tenant scope (the subdomain in prod — always present on
    // an (app) route there — or ?tenant=<slug> in dev), it MUST be the same
    // tenant the cookie authorises (the one whose entry we audited). Otherwise
    // a stale/mismatched cookie could render tenant B's data under a "viewing
    // A" claim, or let the operator browse a tenant they never entered.
    // When no slug is present (dev navigation without ?tenant — no other tenant
    // is referenced, so no leak is possible) we trust the cookie as before.
    const slug = currentTenantSlug();
    if (slug) {
      const slugTenant = await resolveTenantBySlug(slug);
      if (!slugTenant || slugTenant.id !== impersonatingId) {
        redirect(operatorAdminUrl());
      }
    }
  }

  const effectiveTenantId = ctx.user.role === 'operator' ? impersonatingId : ctx.user.tenantId;
  if (!effectiveTenantId) redirect('/login');

  const [tenantBrief] = await db
    .select({
      id: tenants.id,
      displayName: tenants.displayName,
      slug: tenants.slug,
    })
    .from(tenants)
    .where(eq(tenants.id, effectiveTenantId))
    .limit(1);
  if (!tenantBrief) redirect('/login');

  return (
    <Shell
      user={{
        fullName: ctx.user.fullName,
        role: ctx.user.role,
        email: ctx.user.email,
      }}
      tenant={{ displayName: tenantBrief.displayName, slug: tenantBrief.slug }}
    >
      {ctx.user.role === 'operator' && impersonatingId && (
        <ImpersonationBanner tenantName={tenantBrief.displayName} tenantSlug={tenantBrief.slug} />
      )}
      {children}
    </Shell>
  );
}
