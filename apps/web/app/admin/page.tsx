import { adminDb, tenants, users } from '@dealerlink/db';
import { count, eq, gte, sql } from 'drizzle-orm';
import { ArrowRight, Building2 } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { logout } from '@/lib/auth/actions';
import { getAuthContext } from '@/lib/auth/session';
import { displayNameFrom } from '@/lib/format/initials';

export const metadata = { title: 'Operator console · Dealerlink' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  // adminDb bypasses RLS — necessary for cross-tenant metrics.
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const [tenantTotal] = await adminDb.select({ value: count() }).from(tenants);
  const [tenantActive] = await adminDb
    .select({ value: count() })
    .from(tenants)
    .where(eq(tenants.status, 'active'));
  const [tenantsThisMonth] = await adminDb
    .select({ value: count() })
    .from(tenants)
    .where(gte(tenants.createdAt, startOfMonth));
  const [userTotal] = await adminDb
    .select({ value: count() })
    .from(users)
    .where(sql`${users.tenantId} IS NOT NULL`);

  const recent = await adminDb
    .select({
      id: tenants.id,
      slug: tenants.slug,
      displayName: tenants.displayName,
      legalName: tenants.legalName,
      status: tenants.status,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(sql`${tenants.createdAt} desc`)
    .limit(5);

  const metrics = [
    { label: 'Total tenants', value: tenantTotal?.value ?? 0 },
    { label: 'Active', value: tenantActive?.value ?? 0 },
    { label: 'Created this month', value: tenantsThisMonth?.value ?? 0 },
    { label: 'Total tenant users', value: userTotal?.value ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <div className="flex items-start justify-between">
        <div>
          <div className="titlecaps">Platform overview</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">
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

      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="hairline rounded-[8px] bg-white p-4">
            <div className="titlecaps">{m.label}</div>
            <div className="mono mt-2 text-[26px] font-semibold tracking-[-0.02em]">{m.value}</div>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <div className="titlecaps">Recent provisioning</div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/tenants"
              className="text-mute hover:text-ink text-[12.5px] font-medium"
            >
              All tenants
            </Link>
            <Link
              href="/admin/tenants/new"
              className="border-accent bg-accent inline-flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[12px] font-medium text-white hover:bg-[var(--accent-2)]"
            >
              <Building2 size={12} />
              New tenant
            </Link>
          </div>
        </div>
        <div className="hairline mt-3 rounded-[8px] bg-white">
          {recent.length === 0 ? (
            <div className="text-mute px-4 py-6 text-center text-[13px]">
              No tenants yet. Create the first one to get started.
            </div>
          ) : (
            recent.map((t, i) => (
              <div
                key={t.id}
                className={`grid grid-cols-[1.6fr_1fr_0.6fr_0.6fr] items-center px-4 py-3 text-[13px] ${
                  i > 0 ? 'border-line border-t' : ''
                }`}
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
        </div>
      </section>
    </div>
  );
}
