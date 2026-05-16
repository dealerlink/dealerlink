import { adminDb, inboundTokenHistory, tenantSettings, tenants, users } from '@dealerlink/db';
import { count, desc, eq, sql } from 'drizzle-orm';
import { ArrowLeft, Eye, Users2 } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { enterImpersonation } from '@/lib/impersonation/actions';

import { ProvisionedBanner } from './provisioned-banner';
import { TenantDetailSections } from './tenant-detail-sections';

interface PageProps {
  params: { id: string };
  searchParams: { provisioned?: string };
}

export const dynamic = 'force-dynamic';

export default async function TenantDetailPage({ params, searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role !== 'operator') redirect('/dashboard');

  const [tenant] = await adminDb.select().from(tenants).where(eq(tenants.id, params.id)).limit(1);
  if (!tenant) notFound();

  const [settings] = await adminDb
    .select()
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenant.id))
    .limit(1);

  const [userCountRow] = await adminDb
    .select({ value: count() })
    .from(users)
    .where(eq(users.tenantId, tenant.id));

  const [activeTokenHistory] = await adminDb
    .select({ value: count() })
    .from(inboundTokenHistory)
    .where(
      sql`${inboundTokenHistory.tenantId} = ${tenant.id} AND ${inboundTokenHistory.expiresAt} > now()`,
    );

  const recentTokenHistory = await adminDb
    .select({
      token: inboundTokenHistory.token,
      retiredAt: inboundTokenHistory.retiredAt,
      expiresAt: inboundTokenHistory.expiresAt,
    })
    .from(inboundTokenHistory)
    .where(eq(inboundTokenHistory.tenantId, tenant.id))
    .orderBy(desc(inboundTokenHistory.retiredAt))
    .limit(5);

  // The welcome email is enqueued to pg-boss at provisioning time (R.13 —
  // async via the workers process); no inline dispatch needed here.

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <Link
        href="/admin/tenants"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> All tenants
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <div className="titlecaps">Tenant</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">
            {tenant.displayName}
          </h1>
          <div className="mono text-mute mt-1 text-[12.5px]">{tenant.slug}.dealerlink.in</div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/tenants/${tenant.id}/users`}
            className="border-line text-ink hover:bg-paper-2 inline-flex h-9 items-center gap-2 rounded-[6px] border bg-white px-3 text-[12.5px] font-medium"
          >
            <Users2 size={13} />
            Users ({userCountRow?.value ?? 0})
          </Link>
          <form action={enterImpersonation.bind(null, tenant.id)}>
            <button
              type="submit"
              className="border-accent bg-accent inline-flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[12.5px] font-medium text-white hover:bg-[var(--accent-2)]"
            >
              <Eye size={13} />
              Enter workspace
            </button>
          </form>
        </div>
      </div>

      {searchParams.provisioned === '1' ? <ProvisionedBanner tenantId={tenant.id} /> : null}

      <TenantDetailSections
        tenant={{
          id: tenant.id,
          slug: tenant.slug,
          legalName: tenant.legalName,
          displayName: tenant.displayName,
          status: tenant.status,
        }}
        settings={
          settings
            ? {
                gstin: settings.gstin,
                pan: settings.pan,
                state: settings.state,
                addressLine1: settings.addressLine1,
                addressLine2: settings.addressLine2,
                addressCity: settings.addressCity,
                addressState: settings.addressState,
                addressPincode: settings.addressPincode,
                bankAccountName: settings.bankName,
                bankAccountNumber: settings.bankAccountNumber,
                bankIfsc: settings.bankIfsc,
                bankBranch: settings.bankBranch,
                logoUrl: settings.logoUrl,
                primaryColor: settings.primaryColor,
                docPrefixes: settings.docPrefixes as Record<string, string>,
                defaultQuoteValidity: settings.defaultQuoteValidity,
                defaultCreditPeriod: settings.defaultCreditPeriod,
                lowStockThreshold: settings.lowStockThreshold,
                defaultTerms: settings.defaultTerms,
                inboundEmailToken: settings.inboundEmailToken,
              }
            : null
        }
        tokenHistory={{
          activeRetiredCount: activeTokenHistory?.value ?? 0,
          recent: recentTokenHistory.map((r) => ({
            tokenMasked: maskToken(r.token),
            retiredAt: r.retiredAt.toISOString(),
            expiresAt: r.expiresAt.toISOString(),
          })),
        }}
      />
    </div>
  );
}

function maskToken(t: string): string {
  if (t.length <= 6) return '****';
  return `${t.slice(0, 4)}…${t.slice(-2)}`;
}
