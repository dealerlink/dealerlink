import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { recordAccess } from '@/lib/audit/access-log';
import { getAuthContext } from '@/lib/auth/session';
import { formatINRExact } from '@/lib/format';
import { getAuditTrail } from '@/lib/queries/audit';
import { getDealerById } from '@/lib/queries/dealers';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DealerActivity } from './dealer-activity';
import { DealerDetailSections } from './dealer-detail-sections';

interface PageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

function statusTone(s: string): StatusTone {
  if (s === 'active') return 'em';
  if (s === 'on_hold') return 'am';
  return 'mu';
}

export default async function DealerDetailPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const dealer = await getDealerById(tenantId, params.id);
  if (!dealer) notFound();

  // Per CLAUDE.md §7: dealer detail views write an access_log entry.
  void recordAccess('dealer', params.id, 'view').catch(() => null);

  const activity = await getAuditTrail(tenantId, 'dealers', params.id, 50);

  const canEdit = ctx.user.role === 'admin' || ctx.user.role === 'sales';
  const canEditCommercial = ctx.user.role === 'admin';

  return (
    <div className="mx-auto max-w-[920px] px-8 py-12">
      <Link
        href="/dealers"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> All dealers
      </Link>

      <div className="mt-4 flex items-start justify-between">
        <div>
          <div className="mono text-mute text-[11.5px]">{dealer.dealerCode}</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">
            {dealer.displayName}
          </h1>
          <div className="text-mute mt-1 text-[12.5px]">{dealer.legalName}</div>
          <div className="mt-2 flex items-center gap-2">
            <StatusPill tone={statusTone(dealer.status)}>
              {dealer.status.replace('_', ' ')}
            </StatusPill>
            <span className="text-mute text-[11.5px]">
              Last updated{' '}
              <span className="mono">
                {dealer.updatedAt.toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </span>
          </div>
        </div>
        <div className="text-mute text-[11px] italic">Access logged</div>
      </div>

      <DealerDetailSections
        dealer={{
          id: dealer.id,
          legalName: dealer.legalName,
          displayName: dealer.displayName,
          contactPerson: dealer.contactPerson,
          phone: dealer.phone,
          altPhone: dealer.altPhone,
          email: dealer.email,
          altEmail: dealer.altEmail,
          addressLine1: dealer.addressLine1,
          addressLine2: dealer.addressLine2,
          city: dealer.city,
          state: dealer.state,
          pincode: dealer.pincode,
          country: dealer.country,
          gstin: dealer.gstin,
          pan: dealer.pan,
          type: dealer.type,
          category: dealer.category,
          riskLevel: dealer.riskLevel,
          status: dealer.status,
          notes: dealer.notes,
          tags: dealer.tags,
          creditLimit: dealer.creditLimit,
          creditPeriodDays: dealer.creditPeriodDays,
          discountPercent: dealer.discountPercent,
          inactivatedReason: dealer.inactivatedReason,
        }}
        canEdit={canEdit}
        canEditCommercial={canEditCommercial}
        formatINR={formatINRExact}
      />

      <DealerActivity entries={activity} />
    </div>
  );
}
