import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { recordAccess } from '@/lib/audit/access-log';
import { getAuthContext } from '@/lib/auth/session';
import { formatINR, formatINRExact } from '@/lib/format';
import { getDealById } from '@/lib/queries/deals';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DealStageHistorySection } from './stage-history';
import { DealProductsSection } from './products-section';
import { DealOverviewSection } from './overview-section';
import { STAGE_LABEL } from '../stage-meta';

interface PageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

function riskTone(r: string): StatusTone {
  if (r === 'high') return 'ro';
  if (r === 'medium') return 'am';
  return 'em';
}

function statusTone(s: 'open' | 'won' | 'lost'): StatusTone {
  if (s === 'won') return 'em';
  if (s === 'lost') return 'ro';
  return 'in';
}

export default async function DealDetailPage({ params }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const deal = await getDealById(tenantId, params.id);
  if (!deal) notFound();

  // Deal detail is a sensitive read (dealer-tied financial detail).
  void recordAccess('deal', params.id, 'view').catch(() => null);

  return (
    <div className="mx-auto max-w-[920px] px-8 py-10">
      <Link
        href="/pipeline"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Pipeline
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mono text-mute text-[11.5px]">{deal.dealCode}</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">{deal.title}</h1>
          <div className="text-mute mt-1 text-[12.5px]">
            <Link href={`/dealers/${deal.dealer.id}`} className="hover:underline">
              {deal.dealer.name}
            </Link>{' '}
            · {deal.dealer.state ?? '—'}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill tone={statusTone(deal.status)}>
              {deal.status === 'open' ? STAGE_LABEL[deal.stage] : deal.status.toUpperCase()}
            </StatusPill>
            <StatusPill tone={riskTone(deal.dealer.riskLevel)}>
              {deal.dealer.riskLevel} risk
            </StatusPill>
            {deal.hot && <StatusPill tone="ro">Hot</StatusPill>}
            <span className="text-mute text-[11.5px]">
              Owner <span className="text-ink">{deal.assignee.fullName}</span>
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-mute text-[11px] uppercase tracking-[0.06em]">Est. value</div>
          <div className="mono text-ink mt-1 text-[22px] font-semibold">
            {deal.estimatedValue != null ? formatINR(deal.estimatedValue) : '—'}
          </div>
          {deal.estimatedValue != null && (
            <div className="mono text-mute mt-0.5 text-[11px]">
              {formatINRExact(deal.estimatedValue)}
            </div>
          )}
        </div>
      </div>

      <DealOverviewSection deal={deal} />
      <DealProductsSection products={deal.products} />
      <DealStageHistorySection history={deal.history} />
    </div>
  );
}
