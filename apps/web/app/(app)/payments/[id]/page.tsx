import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { getDealerOutstandingOrders, getPaymentById } from '@/lib/queries/payments';
import { impersonationTenantId } from '@/lib/tenant/context';

import { paymentMethodLabel, paymentStatusLabel, paymentStatusTone } from '../payment-status';
import { DeallocateButton } from './deallocate-button';
import { PaymentActions } from './payment-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
  searchParams: { allocate?: string };
}

export default async function PaymentDetailPage({ params, searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  if (ctx.user.role === 'sales' || ctx.user.role === 'dispatch') redirect('/dashboard');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const payment = await getPaymentById(tenantId, params.id);
  if (!payment) notFound();

  const isAdmin = ctx.user.role === 'admin';
  const canManage = isAdmin || ctx.user.role === 'accounts';
  const outstandingOrders =
    canManage && (payment.status === 'verified' || payment.status === 'cleared')
      ? await getDealerOutstandingOrders(tenantId, payment.dealerId)
      : [];

  // Verification timeline derived from the stamped trail columns.
  const timeline: Array<{ label: string; at: Date; note?: string | null }> = [
    { label: 'Recorded', at: payment.createdAt },
  ];
  if (payment.verifiedAt) timeline.push({ label: 'Verified', at: payment.verifiedAt });
  if (payment.clearedAt) timeline.push({ label: 'Cleared', at: payment.clearedAt });
  if (payment.bouncedAt)
    timeline.push({ label: 'Bounced', at: payment.bouncedAt, note: payment.bouncedReason });
  if (payment.refundedAt)
    timeline.push({ label: 'Refunded', at: payment.refundedAt, note: payment.refundedReason });

  return (
    <div className="mx-auto max-w-[1000px] px-8 py-10">
      <Link
        href="/payments"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Payments
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <div className="titlecaps mb-1">Payment receipt</div>
          <h1 className="flex items-center gap-3 text-[26px] font-semibold tracking-[-0.02em]">
            <span className="mono">{payment.paymentNumber}</span>
            <StatusPill tone={paymentStatusTone(payment.status)}>
              {paymentStatusLabel(payment.status)}
            </StatusPill>
          </h1>
          <p className="text-mute mt-1 text-[13px]">
            {payment.dealerName} · received{' '}
            {formatDate(new Date(payment.receivedDate + 'T00:00:00Z'))}
          </p>
        </div>
        <PaymentActions
          id={payment.id}
          paymentNumber={payment.paymentNumber}
          status={payment.status}
          isAdmin={isAdmin}
          canManage={canManage}
          unallocatedAmount={payment.unallocatedAmount}
          outstandingOrders={outstandingOrders}
          autoOpenAllocate={searchParams.allocate === '1'}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Identity</div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              <RowKV label="Payment no." value={payment.paymentNumber} mono />
              <RowKV
                label="Received date"
                value={formatDate(new Date(payment.receivedDate + 'T00:00:00Z'))}
                mono
              />
              <RowKV label="Dealer" value={payment.dealerName} />
              <RowKV label="Method" value={paymentMethodLabel(payment.method)} />
              <RowKV label="Reference" value={payment.reference ?? '—'} mono />
              <RowKV
                label="Deposited to"
                value={
                  payment.depositedToBank
                    ? `${payment.depositedToBank}${
                        payment.depositedDate
                          ? ` · ${formatDate(new Date(payment.depositedDate + 'T00:00:00Z'))}`
                          : ''
                      }`
                    : '—'
                }
              />
            </dl>
            {payment.notes && (
              <p className="text-mute border-line mt-4 border-t pt-3 text-[12.5px]">
                {payment.notes}
              </p>
            )}
          </section>

          <section className="border-line overflow-hidden rounded-[6px] border bg-white">
            <div className="border-line flex items-center justify-between border-b px-5 py-3">
              <div className="titlecaps text-mute">Allocations</div>
              <span className="text-mute mono text-[11px]">
                {payment.allocations.length} row(s)
              </span>
            </div>
            {payment.allocations.length === 0 ? (
              <div className="text-mute px-5 py-10 text-center text-[12.5px]">
                Not allocated to any order or PI yet.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                    <th className="px-4 py-2.5 font-medium">Against</th>
                    <th className="px-4 py-2.5 font-medium">Document</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                    <th className="px-4 py-2.5 font-medium">Allocated by</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {payment.allocations.map((a) => (
                    <tr key={a.id} className="border-line border-b last:border-b-0">
                      <td className="text-mute px-4 py-2.5 text-[12px]">{a.documentLabel}</td>
                      <td className="mono px-4 py-2.5 text-[12px]">
                        {a.documentLabel === 'Order' && a.documentId ? (
                          <Link href={`/orders/${a.documentId}`} className="hover:underline">
                            {a.documentNumber}
                          </Link>
                        ) : a.documentId ? (
                          <Link href={`/pi/${a.documentId}`} className="hover:underline">
                            {a.documentNumber}
                          </Link>
                        ) : (
                          a.documentNumber
                        )}
                      </td>
                      <td className="mono px-4 py-2.5 text-right tabular-nums">
                        {formatINRExact(a.amount)}
                      </td>
                      <td className="text-mute px-4 py-2.5 text-[12px]">
                        {a.allocatedByName ?? '—'} ·{' '}
                        {a.allocatedAt.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canManage &&
                          (payment.status === 'verified' || payment.status === 'cleared') && (
                            <DeallocateButton allocationId={a.id} />
                          )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="border-line rounded-[6px] border bg-white p-5">
            <div className="titlecaps text-mute mb-3">Status history</div>
            <ul className="space-y-2 text-[12.5px]">
              {timeline.map((t, i) => (
                <li key={i} className="border-line flex items-baseline gap-3 border-l-2 pl-3">
                  <span className="text-mute mono w-28 shrink-0 text-[11px]">
                    {t.at.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                  <span className="text-ink">
                    <span className="font-medium">{t.label}</span>
                    {t.note && <span className="text-mute"> · {t.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="border-line self-start rounded-[6px] border bg-white p-5">
          <div className="titlecaps text-mute mb-3">Money</div>
          <div className="mb-3">
            <div className="text-mute text-[11px] uppercase tracking-wide">Amount received</div>
            <div className="text-ink mono text-[24px] font-semibold tabular-nums">
              {formatINRExact(payment.amount)}
            </div>
          </div>
          <dl className="space-y-2 text-[13px]">
            <RowKV label="Allocated" value={formatINRExact(payment.allocatedAmount)} />
            <RowKV
              label="Unallocated"
              value={formatINRExact(payment.unallocatedAmount)}
              accent={payment.unallocatedAmount > 0}
            />
          </dl>
          {payment.unallocatedAmount > 0 &&
            (payment.status === 'verified' || payment.status === 'cleared') && (
              <p className="mt-3 rounded-[4px] bg-indigo-50 px-2 py-1.5 text-[11.5px] text-indigo-700">
                Advance balance — held as credit until allocated to an order.
              </p>
            )}
        </aside>
      </div>
    </div>
  );
}

function RowKV({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-mute text-[12px]">{label}</dt>
      <dd
        className={`text-[13px] tabular-nums ${mono ? 'mono' : ''} ${
          accent ? 'text-accent font-semibold' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
