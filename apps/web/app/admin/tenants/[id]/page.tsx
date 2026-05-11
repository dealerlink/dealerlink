import { db, tenantSettings, tenants } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';
import { ArrowLeft, Eye } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { enterImpersonation } from '@/lib/impersonation/actions';

interface TenantDetailPageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, params.id)).limit(1);
  if (!tenant) notFound();

  // Settings live behind RLS — read with tenant scope set.
  const settings = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant.id}, true)`);
    const [row] = await tx
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenant.id))
      .limit(1);
    return row;
  });

  return (
    <div className="bg-paper min-h-screen">
      <div className="mx-auto max-w-[760px] px-8 py-16">
        <Link
          href="/admin"
          className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
        >
          <ArrowLeft size={12} /> Back to tenants
        </Link>

        <div className="mt-5 flex items-start justify-between">
          <div>
            <div className="titlecaps">Tenant</div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">
              {tenant.displayName}
            </h1>
            <div className="mono text-mute mt-1 text-[12.5px]">{tenant.slug}.dealerlink.in</div>
          </div>
          <form action={enterImpersonation.bind(null, tenant.id)}>
            <button
              type="submit"
              className="inline-flex h-[40px] items-center gap-2 rounded-[6px] bg-[var(--accent)] px-4 text-[13px] font-medium text-white hover:bg-[var(--accent-2)]"
            >
              <Eye size={14} />
              Enter tenant workspace
            </button>
          </form>
        </div>

        <section className="hairline mt-8 rounded-[8px] bg-white p-5">
          <div className="titlecaps mb-3">Details</div>
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-[13px]">
            <dt className="text-mute">Legal name</dt>
            <dd>{tenant.legalName}</dd>
            <dt className="text-mute">Status</dt>
            <dd className="capitalize">{tenant.status}</dd>
            <dt className="text-mute">GSTIN</dt>
            <dd className="mono">{settings?.gstin ?? '—'}</dd>
            <dt className="text-mute">State</dt>
            <dd>{settings?.state ?? '—'}</dd>
            <dt className="text-mute">Address</dt>
            <dd>
              {settings?.addressLine1 ?? '—'}
              {settings?.addressCity ? `, ${settings.addressCity}` : ''}
              {settings?.addressPincode ? ` ${settings.addressPincode}` : ''}
            </dd>
            <dt className="text-mute">Bank</dt>
            <dd>
              {settings?.bankName ?? '—'}{' '}
              <span className="mono text-mute">
                {settings?.bankIfsc ? `· ${settings.bankIfsc}` : ''}
              </span>
            </dd>
          </dl>
        </section>

        <p className="text-mute mt-4 text-[12px]">
          Entering the workspace sets a 1-hour, read-only impersonation cookie. Mutations are
          blocked at the DB layer; every page view is recorded in{' '}
          <span className="mono">access_log</span>.
        </p>
      </div>
    </div>
  );
}
