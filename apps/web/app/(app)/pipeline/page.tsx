import { Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { getAuthContext } from '@/lib/auth/session';
import { formatINR } from '@/lib/format';
import { listDealsByStage } from '@/lib/queries/deals';
import { impersonationTenantId } from '@/lib/tenant/context';

import { PipelineBoard } from './pipeline-board';

import type { DealStage } from '@dealerlink/db';

import type { DealCardData } from './deal-card';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Pipeline' };

export default async function PipelinePage() {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const grouped = await listDealsByStage(tenantId);

  const byStage = {} as Record<DealStage, DealCardData[]>;
  let totalCount = 0;
  let totalValue = 0;
  for (const [stage, cards] of grouped) {
    const mapped: DealCardData[] = cards.map((c) => ({
      id: c.id,
      dealCode: c.dealCode,
      title: c.title,
      estimatedValue: c.estimatedValue,
      hot: c.hot,
      lastActivityAt: c.lastActivityAt,
      dealer: {
        id: c.dealer.id,
        name: c.dealer.name,
        riskLevel: c.dealer.riskLevel,
      },
      assignee: {
        initials: c.assignee.initials,
        fullName: c.assignee.fullName,
      },
    }));
    byStage[stage] = mapped;
    if (stage !== 'closed') {
      totalCount += mapped.length;
      totalValue += mapped.reduce((sum, c) => sum + (c.estimatedValue ?? 0), 0);
    }
  }

  const canCreate = ctx.user.role === 'admin' || ctx.user.role === 'sales';

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">Sales Pipeline</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Pipeline</h1>
          <p className="text-mute mt-1 text-[13px]">
            <span className="mono">{totalCount.toLocaleString('en-IN')}</span> open ·{' '}
            <span className="mono">{formatINR(totalValue)}</span> in flight
          </p>
        </div>
        {canCreate && (
          <Button asChild variant="primary">
            <Link href="/pipeline/new">
              <Plus size={13} /> New deal
            </Link>
          </Button>
        )}
      </div>

      <PipelineBoard
        initialByStage={byStage}
        viewerRole={ctx.user.role as 'admin' | 'sales' | 'accounts' | 'dispatch'}
        viewerId={ctx.user.id}
      />
    </div>
  );
}
