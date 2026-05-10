import { db, tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { Shell } from '@/components/shell';
import { getAuthContext } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role === 'operator') redirect('/admin');

  let tenantBrief: { displayName: string; slug: string } | null = null;
  if (ctx.user.tenantId) {
    const [row] = await db
      .select({ displayName: tenants.displayName, slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, ctx.user.tenantId))
      .limit(1);
    tenantBrief = row ?? null;
  }

  return (
    <Shell
      user={{
        fullName: ctx.user.fullName,
        role: ctx.user.role,
        email: ctx.user.email,
      }}
      tenant={tenantBrief}
    >
      {children}
    </Shell>
  );
}
