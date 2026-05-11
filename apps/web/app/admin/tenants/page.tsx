import { adminDb, tenants } from '@dealerlink/db';
import { ArrowRight, Building2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';

export const metadata = { title: 'Tenants · Admin · Dealerlink' };
export const dynamic = 'force-dynamic';

export default async function TenantsListPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  const rows = await adminDb
    .select({
      id: tenants.id,
      slug: tenants.slug,
      displayName: tenants.displayName,
      legalName: tenants.legalName,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(tenants.displayName);

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <div className="flex items-start justify-between">
        <div>
          <div className="titlecaps">Tenants</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">
            {rows.length} tenant{rows.length === 1 ? '' : 's'}
          </h1>
        </div>
        <Link
          href="/admin/tenants/new"
          className="border-accent bg-accent inline-flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[12.5px] font-medium text-white hover:bg-[var(--accent-2)]"
        >
          <Building2 size={13} />
          New tenant
        </Link>
      </div>

      <section className="hairline mt-6 rounded-[8px] bg-white">
        <div className="table-head grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr] px-4 py-2.5">
          <div>Tenant</div>
          <div>Slug</div>
          <div>Status</div>
          <div className="text-right">Action</div>
        </div>
        {rows.length === 0 ? (
          <div className="text-mute border-line border-t px-4 py-8 text-center text-[13px]">
            No tenants yet. Create one to get started.
          </div>
        ) : (
          rows.map((t) => (
            <div
              key={t.id}
              className="border-line grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr] items-center border-t px-4 py-3 text-[13px]"
            >
              <div>
                <div className="font-medium">{t.displayName}</div>
                <div className="text-mute text-[11.5px]">{t.legalName}</div>
              </div>
              <div className="mono text-mute text-[12px]">{t.slug}.dealerlink.in</div>
              <div>
                <span className="chip">
                  <span className={`dot ${t.status === 'active' ? 's-em' : 's-am'}`} />
                  {t.status}
                </span>
              </div>
              <div className="text-right">
                <Link
                  href={`/admin/tenants/${t.id}`}
                  className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent)] hover:underline"
                >
                  Open
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
