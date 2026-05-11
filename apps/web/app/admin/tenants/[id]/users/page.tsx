import { adminDb, tenants, users } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

import { TenantUsersPanel } from './users-panel';

interface PageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

export default async function TenantUsersPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  const [tenant] = await adminDb.select().from(tenants).where(eq(tenants.id, params.id)).limit(1);
  if (!tenant) notFound();

  const rows = await adminDb
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      fullName: users.fullName,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      lastAuthEventAt: users.lastAuthEventAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.tenantId, tenant.id))
    .orderBy(users.fullName);

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <Link
        href={`/admin/tenants/${tenant.id}`}
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Back to tenant
      </Link>
      <div className="mt-4">
        <div className="titlecaps">{tenant.displayName}</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">Users</h1>
        <p className="text-mute mt-1 text-[13px]">
          Provision admins, sales, accounts, and dispatch users for this tenant. All temporary
          credentials are emailed and force a password rotation on first sign-in.
        </p>
      </div>

      <TenantUsersPanel
        tenantId={tenant.id}
        tenantSlug={tenant.slug}
        initialUsers={rows.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          fullName: u.fullName,
          status: u.status,
          mustChangePassword: u.mustChangePassword,
          lastAuthEventAt: u.lastAuthEventAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
