import Link from 'next/link';

import { getAuthContext } from '@/lib/auth/session';
import { formatINRExact } from '@/lib/format';
import { displayNameFrom } from '@/lib/format/initials';
import { getDealMetrics } from '@/lib/queries/deals';
import { getDispatchDashboard } from '@/lib/queries/dispatch';
import { getPaymentDashboard } from '@/lib/queries/payments';
import { inventoryDashboardStats } from '@/lib/queries/procurements';
import { impersonationTenantId } from '@/lib/tenant/context';
import { formatDate } from '@/lib/format';

import { PipelineFunnel, PipelineHotStalled, PipelineKpiRow } from './pipeline-widgets';
import { ReportWidgets } from './report-widgets';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Dashboard' };

function timeOfDay(date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  const tenantId = ctx?.user.tenantId ?? impersonationTenantId();

  const stats = tenantId
    ? await inventoryDashboardStats(tenantId)
    : { counts: {}, lowStock: [], recent: [] };
  const pipelineMetrics = tenantId
    ? await getDealMetrics(tenantId)
    : {
        total: 0,
        totalValue: 0,
        byStage: [] as never[],
        hotCount: 0,
        stalledCount: 0,
        hotSample: [] as never[],
        stalledSample: [] as never[],
      };

  // Payment widgets are for the cash side — admin + accounts only.
  const showPayments = !!tenantId && (ctx?.user.role === 'admin' || ctx?.user.role === 'accounts');
  const paymentDash = showPayments ? await getPaymentDashboard(tenantId) : null;

  const dispatchDash = tenantId ? await getDispatchDashboard(tenantId) : null;

  const fullDisplay = ctx ? displayNameFrom(ctx.user.fullName, ctx.user.email) : 'there';
  const firstName = fullDisplay.split(' ')[0] ?? fullDisplay;
  const tod = timeOfDay();

  const inStock = stats.counts['in_stock'] ?? 0;
  const reserved = stats.counts['reserved'] ?? 0;
  const dispatched = stats.counts['dispatched'] ?? 0;
  const delivered = stats.counts['delivered'] ?? 0;

  return (
    <div className="px-6 py-5">
      <div className="titlecaps mb-1">Overview</div>
      <h1 className="mb-6 text-[28px] font-semibold tracking-[-0.02em]">
        Good <span className="editorial font-normal">{tod}</span>, {firstName}.
      </h1>

      <div className="grid grid-cols-4 gap-3">
        <Kpi label="In stock" value={inStock} accent="emerald" />
        <Kpi label="Reserved" value={reserved} accent="amber" />
        <Kpi label="Dispatched" value={dispatched} accent="indigo" />
        <Kpi label="Delivered" value={delivered} accent="mute" />
      </div>

      <PipelineKpiRow metrics={pipelineMetrics} />
      <PipelineFunnel metrics={pipelineMetrics} />
      <PipelineHotStalled metrics={pipelineMetrics} />

      {tenantId && ctx && <ReportWidgets tenantId={tenantId} role={ctx.user.role} />}

      {paymentDash && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps mb-3 flex items-center justify-between">
              <span>Overdue payments</span>
              <Link href="/payments" className="text-accent text-[11px] hover:underline">
                Payments →
              </Link>
            </div>
            <div className="mono text-[28px] font-semibold tracking-tight text-rose-700">
              {paymentDash.overdueCount.toLocaleString('en-IN')}
            </div>
            <div className="text-mute mt-1 text-[12.5px]">
              {formatINRExact(paymentDash.overdueOutstanding)} outstanding past credit period
            </div>
          </section>

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps mb-3">Recent payments · 7 days</div>
            {paymentDash.recentPayments.length === 0 ? (
              <div className="text-mute text-[12.5px]">No payments in the last 7 days.</div>
            ) : (
              <ul className="space-y-2">
                {paymentDash.recentPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <div className="min-w-0">
                      <Link href={`/payments/${p.id}`} className="mono text-[12px] hover:underline">
                        {p.paymentNumber}
                      </Link>
                      <div className="text-mute truncate text-[11.5px]">{p.dealerName}</div>
                    </div>
                    <div className="text-right">
                      <div className="mono text-[12px]">{formatINRExact(p.amount)}</div>
                      <div className="text-mute mono text-[11px]">
                        {formatDate(new Date(p.receivedDate + 'T00:00:00Z'))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps mb-3">Unallocated payments</div>
            <div className="mono text-[28px] font-semibold tracking-tight text-indigo-700">
              {paymentDash.unallocatedCount.toLocaleString('en-IN')}
            </div>
            <div className="text-mute mt-1 text-[12.5px]">
              Verified / cleared payments with an advance balance waiting to be applied.
            </div>
          </section>
        </div>
      )}

      {dispatchDash && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps mb-3 flex items-center justify-between">
              <span>Dispatches today</span>
              <Link href="/dispatch" className="text-accent text-[11px] hover:underline">
                Dispatch →
              </Link>
            </div>
            <div className="mono text-[28px] font-semibold tracking-tight text-indigo-700">
              {dispatchDash.todayCount.toLocaleString('en-IN')}
            </div>
            <div className="text-mute mt-1 text-[12.5px]">
              {dispatchDash.todayUnits.toLocaleString('en-IN')} unit(s) shipped today
            </div>
          </section>

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps mb-3">In-transit dispatches</div>
            <div className="mono text-[28px] font-semibold tracking-tight text-amber-600">
              {dispatchDash.inTransitCount.toLocaleString('en-IN')}
            </div>
            <div className="text-mute mt-1 text-[12.5px]">
              {dispatchDash.arrivingSoonCount.toLocaleString('en-IN')} with delivery expected in the
              next 7 days
            </div>
          </section>

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps mb-3 flex items-center justify-between">
              <span>Orders ready to dispatch</span>
              <Link href="/dispatch/new" className="text-accent text-[11px] hover:underline">
                New dispatch →
              </Link>
            </div>
            <div className="mono text-[28px] font-semibold tracking-tight text-emerald-700">
              {dispatchDash.readyToDispatchCount.toLocaleString('en-IN')}
            </div>
            <div className="text-mute mt-1 text-[12.5px]">
              Confirmed orders with reserved inventory still to ship.
            </div>
          </section>
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4">
        <section className="border-line rounded-[6px] border bg-white p-5">
          <div className="titlecaps mb-3 flex items-center justify-between">
            <span>Low stock alerts</span>
            <Link href="/inventory" className="text-accent text-[11px] hover:underline">
              All inventory →
            </Link>
          </div>
          {stats.lowStock.length === 0 ? (
            <div className="text-mute text-[12.5px]">All products are above threshold.</div>
          ) : (
            <ul className="space-y-2">
              {stats.lowStock.map((p) => (
                <li key={p.product_id} className="flex items-center justify-between text-[13px]">
                  <Link href={`/catalog/${p.product_id}`} className="text-ink hover:underline">
                    {p.name}
                  </Link>
                  <span className="mono text-rose-700">
                    {p.n} <span className="text-mute">in stock</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="border-line rounded-[6px] border bg-white p-5">
          <div className="titlecaps mb-3 flex items-center justify-between">
            <span>Recent procurements</span>
            <Link
              href="/inventory/procurements"
              className="text-accent text-[11px] hover:underline"
            >
              All →
            </Link>
          </div>
          {stats.recent.length === 0 ? (
            <div className="text-mute text-[12.5px]">No procurements yet.</div>
          ) : (
            <ul className="space-y-2">
              {stats.recent.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <div className="min-w-0">
                    <Link
                      href={`/inventory/procurements/${p.id}`}
                      className="mono text-[12.5px] hover:underline"
                    >
                      {p.procurement_number}
                    </Link>
                    <div className="text-mute truncate text-[11.5px]">{p.supplier_name}</div>
                  </div>
                  <div className="text-right">
                    <div className="mono text-[12.5px]">
                      {formatINRExact(Number(p.total_amount))}
                    </div>
                    <div className="text-mute mono text-[11px]">{p.procurement_date}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: 'emerald' | 'amber' | 'indigo' | 'mute';
}) {
  const dotColor = {
    emerald: '#10B981',
    amber: '#F59E0B',
    indigo: '#4F46E5',
    mute: '#9CA3AF',
  }[accent];
  return (
    <div className="border-line rounded-[6px] border bg-white p-4">
      <div className="text-mute mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.05em]">
        <span
          className="inline-block h-[6px] w-[6px] flex-shrink-0 rounded-full"
          style={{ background: dotColor }}
        />
        {label}
      </div>
      <div className="mono text-[28px] font-semibold tracking-tight">
        {value.toLocaleString('en-IN')}
      </div>
    </div>
  );
}
