import { db, tenants } from '@dealerlink/db';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { logout } from '@/lib/auth/actions';
import { getAuthContext } from '@/lib/auth/session';
import { displayNameFrom } from '@/lib/format/initials';

export const metadata = { title: 'Admin · Dealerlink' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  const tenantRows = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      displayName: tenants.displayName,
      legalName: tenants.legalName,
      status: tenants.status,
    })
    .from(tenants)
    .orderBy(tenants.displayName);

  return (
    <div className="bg-paper min-h-screen">
      <div className="mx-auto max-w-[920px] px-8 py-16">
        <div className="flex items-start justify-between">
          <div>
            <div className="titlecaps">Operator console</div>
            <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.02em]">
              Welcome,{' '}
              <span className="editorial font-normal">
                {displayNameFrom(ctx.user.fullName, ctx.user.email)}
              </span>
              .
            </h1>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="border-line text-ink hover:bg-paper-2 inline-flex h-9 items-center rounded-[6px] border bg-white px-3 text-[12.5px] font-medium"
            >
              Sign out
            </button>
          </form>
        </div>

        <section className="mt-10">
          <div className="titlecaps mb-3">Tenants</div>
          <div className="hairline rounded-[8px] bg-white">
            <div className="table-head grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr] px-4 py-2.5">
              <div>Tenant</div>
              <div>Slug</div>
              <div>Status</div>
              <div className="text-right">Action</div>
            </div>
            {tenantRows.map((t) => (
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
                    <span className="dot s-em" />
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
            ))}
          </div>
        </section>

        <p className="text-mute mt-6 text-[12.5px]">
          Full tenant provisioning (ADR-002) is a later milestone. Day 3 ships the impersonation
          flow so operators can debug live tenant state.
        </p>
      </div>
    </div>
  );
}
