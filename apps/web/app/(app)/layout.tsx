import { db, tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ImpersonationBanner } from '@/components/shell/ImpersonationBanner';
import { Shell } from '@/components/shell';
import { getAuthContext } from '@/lib/auth/session';
import { impersonationTenantId } from '@/lib/tenant/context';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');

  const impersonatingId = impersonationTenantId();

  // Operators are only allowed in the tenant shell if they hold an
  // impersonation cookie. Otherwise they belong on /admin.
  if (ctx.user.role === 'operator' && !impersonatingId) {
    redirect('/admin');
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
