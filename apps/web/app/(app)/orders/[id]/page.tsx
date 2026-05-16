import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { getOrderById, getReservationPreview } from '@/lib/queries/orders';
import { getOrderPayments } from '@/lib/queries/payments';
import { impersonationTenantId } from '@/lib/tenant/context';

import { paymentStatusTone as paymentRowTone } from '../../payments/payment-status';
import { orderStatusTone, paymentStatusTone } from '../order-status';
import { OrderActions } from './order-actions';

export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'lines', label: 'Line items' },
  { key: 'reservations', label: 'Inventory reservations' },
  { key: 'payments', label: 'Payments' },
  { key: 'history', label: 'Status history' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface PageProps {
  params: { id: string };
  searchParams: { tab?: string };
}

function Party({
  label,
  party,
}: {
  label: string;
  party: { name: string; legalName: string; state: string | null; gstin: string | null };
}) {
  return (
    <div>
      <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">{label}</div>
      <div className="text-ink font-medium">{party.name}</div>
      {party.legalName !== party.name && (
        <div className="text-mute text-[12.5px]">{party.legalName}</div>
      )}
      <div className="text-mute mono text-[12px]">
        {party.gstin ?? '—'} · {party.state ?? '—'}
      </div>
    </div>
  );
}

export default async function OrderDetailPage({ params, searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const order = await getOrderById(tenantId, params.id);
  if (!order) notFound();

  const tab: TabKey = TABS.some((t) => t.key === searchParams.tab)
    ? (searchParams.tab as TabKey)
    : 'overview';

  const role = ctx.user.role;
  const isAdmin = role === 'admin';
  const canConfirm = role === 'admin' || role === 'sales';
  const canEditDispatch = role === 'admin' || role === 'dispatch';

  const preview =
    order.status === 'pending' ? (await getReservationPreview(tenantId, order.id)).lines : null;

  const canRecordPayment = role === 'admin' || role === 'accounts';
  const orderPayments = tab === 'payments' ? await getOrderPayments(tenantId, order.id) : null;

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-10">
      <Link
        href="/orders"
        className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
      >
        <ArrowLeft size={12} /> Orders
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <div className="titlecaps mb-1">Order</div>
          <h1 className="flex items-center gap-3 text-[26px] font-semibold tracking-[-0.02em]">
            <span className="mono">{order.orderNumber}</span>
            <StatusPill tone={orderStatusTone(order.status)}>
              {order.status.replace(/_/g, ' ')}
            </StatusPill>
            <StatusPill tone={paymentStatusTone(order.paymentStatus)}>
              {order.paymentStatus.replace(/_/g, ' ')}
            </StatusPill>
          </h1>
          <p className="text-mute mt-1 text-[13px]">
            {formatDate(new Date(order.orderDate + 'T00:00:00Z'))}
            {order.piNumber && (
              <>
                {' '}
                · from{' '}
                <Link href={`/pi/${order.performaInvoiceId}`} className="text-ink hover:underline">
                  {order.piNumber}
                </Link>
              </>
            )}
          </p>
        </div>
        <OrderActions
          id={order.id}
          orderNumber={order.orderNumber}
          status={order.status}
          isAdmin={isAdmin}
          canConfirm={canConfirm}
          canEditDispatch={canEditDispatch}
          expectedDispatchDate={order.expectedDispatchDate}
          preview={preview}
        />
      </div>

      <div className="border-line mt-6 flex gap-1 border-b">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/orders/${order.id}?tab=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${
              tab === t.key
                ? 'border-ink text-ink font-medium'
                : 'text-mute hover:text-ink border-transparent'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <section className="border-line space-y-4 rounded-[6px] border bg-white p-5">
              <div className="titlecaps text-mute">Parties</div>
              {order.threeParty ? (
                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  <Party label="Bill to" party={order.billTo} />
                  <Party label="Ship to" party={order.shipTo} />
                </div>
              ) : (
                <div className="text-[13px]">
                  <Party label="Bill to & Ship to" party={order.billTo} />
                  <div className="text-mute mt-1 text-[12px]">Ship-To same as Bill-To.</div>
                </div>
              )}
              <div className="border-line grid grid-cols-2 gap-4 border-t pt-4 text-[13px]">
                <div>
                  <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">
                    Place of supply
                  </div>
                  <div className="mono text-ink text-[15px]">{order.placeOfSupply}</div>
                  <StatusPill tone={order.isInterState ? 'am' : 'in'}>
                    {order.isInterState ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}
                  </StatusPill>
                </div>
                <div>
                  <div className="text-mute mb-1 text-[11px] uppercase tracking-wide">
                    Expected dispatch
                  </div>
                  <div className="mono text-ink">
                    {order.expectedDispatchDate
                      ? formatDate(new Date(order.expectedDispatchDate + 'T00:00:00Z'))
                      : 'Not set'}
                  </div>
                </div>
              </div>
              {order.cancelledReason && (
                <div className="rounded-[6px] border border-rose-200 bg-rose-50 p-3 text-[12.5px]">
                  <span className="font-medium text-rose-700">Cancelled:</span>{' '}
                  {order.cancelledReason}
                </div>
              )}
            </section>
            <aside className="border-line self-start rounded-[6px] border bg-white p-5">
              <div className="titlecaps text-mute mb-3">Totals</div>
              <dl className="space-y-2 text-[13px]">
                <RowKV label="Subtotal" value={formatINRExact(order.subtotal)} />
                {order.discountAmount > 0 && (
                  <RowKV
                    label="Discount"
                    value={`− ${formatINRExact(order.discountAmount)}`}
                    mute
                  />
                )}
                <RowKV label="Taxable" value={formatINRExact(order.taxableAmount)} />
                {order.igstAmount > 0 ? (
                  <RowKV label="IGST" value={formatINRExact(order.igstAmount)} />
                ) : (
                  <>
                    <RowKV label="CGST" value={formatINRExact(order.cgstAmount)} />
                    <RowKV label="SGST" value={formatINRExact(order.sgstAmount)} />
                  </>
                )}
              </dl>
              <div className="border-line mt-4 flex items-baseline justify-between border-t pt-3">
                <span className="text-mute text-[12px]">Total</span>
                <span className="text-ink mono text-[22px] font-semibold tabular-nums">
                  {formatINRExact(order.totalAmount)}
                </span>
              </div>
            </aside>
          </div>
        )}

        {tab === 'lines' && (
          <section className="border-line overflow-hidden rounded-[6px] border bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 text-right font-medium">Ordered</th>
                  <th className="px-4 py-3 text-right font-medium">Reserved</th>
                  <th className="px-4 py-3 text-right font-medium">Dispatched</th>
                  <th className="px-4 py-3 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id} className="border-line border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="text-ink font-medium">{l.productName}</div>
                      <div className="text-mute mono text-[11px]">
                        {l.productSku} · HSN {l.hsnCode} · {l.gstRate}%
                      </div>
                    </td>
                    <td className="mono px-4 py-3 text-right tabular-nums">
                      {l.quantity} {l.unitOfMeasure}
                    </td>
                    <td className="mono px-4 py-3 text-right tabular-nums">
                      <span className={l.reservedQuantity >= l.quantity ? 'text-emerald-700' : ''}>
                        {l.reservedQuantity}
                      </span>
                    </td>
                    <td className="mono text-mute px-4 py-3 text-right tabular-nums">
                      {l.dispatchedQuantity}
                    </td>
                    <td className="mono px-4 py-3 text-right tabular-nums">
                      {formatINRExact(l.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-mute border-line border-t px-4 py-2 text-[11.5px]">
              Dispatched quantities are populated by the dispatch module (Day 13).
            </p>
          </section>
        )}

        {tab === 'reservations' && (
          <section className="border-line overflow-hidden rounded-[6px] border bg-white">
            {order.reservedSerials.length === 0 ? (
              <div className="text-mute px-6 py-12 text-center text-[13px]">
                No inventory reserved yet — confirm the order to reserve serials.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                    <th className="px-4 py-3 font-medium">Serial</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Warehouse</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {order.reservedSerials.map((s) => (
                    <tr key={s.id} className="border-line border-b last:border-b-0">
                      <td className="mono px-4 py-2.5 text-[12px]">{s.serialNumber ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        {s.productName}{' '}
                        <span className="text-mute mono text-[11px]">· {s.productSku}</span>
                      </td>
                      <td className="text-mute mono px-4 py-2.5 text-[12px]">
                        {s.warehouseCode ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPill tone={s.status === 'reserved' ? 'in' : 'mu'}>
                          {s.status}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {tab === 'payments' && orderPayments && (
          <section className="space-y-4">
            <div className="border-line overflow-hidden rounded-[6px] border bg-white">
              {orderPayments.rows.length === 0 ? (
                <div className="text-mute px-6 py-12 text-center text-[13px]">
                  No payments allocated to this order yet.
                </div>
              ) : (
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                      <th className="px-4 py-3 font-medium">Payment #</th>
                      <th className="px-4 py-3 text-right font-medium">Allocated</th>
                      <th className="px-4 py-3 font-medium">Payment status</th>
                      <th className="px-4 py-3 font-medium">Allocated by</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderPayments.rows.map((p) => (
                      <tr key={p.allocationId} className="border-line border-b last:border-b-0">
                        <td className="mono px-4 py-2.5 text-[12.5px]">
                          <Link href={`/payments/${p.paymentId}`} className="hover:underline">
                            {p.paymentNumber}
                          </Link>
                        </td>
                        <td className="mono px-4 py-2.5 text-right tabular-nums">
                          {formatINRExact(p.amount)}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPill tone={paymentRowTone(p.paymentStatus)}>
                            {p.paymentStatus.replace(/_/g, ' ')}
                          </StatusPill>
                        </td>
                        <td className="text-mute px-4 py-2.5 text-[12px]">
                          {p.allocatedByName ?? '—'}
                        </td>
                        <td className="text-mute mono px-4 py-2.5 text-[12px]">
                          {p.allocatedAt.toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="border-line flex items-center justify-between rounded-[6px] border bg-white px-5 py-3 text-[13px]">
              <div className="flex items-center gap-5">
                <span className="text-mute">
                  Total paid{' '}
                  <span className="mono text-ink font-semibold">
                    {formatINRExact(orderPayments.totalPaid)}
                  </span>
                </span>
                <span className="text-mute">
                  Outstanding{' '}
                  <span className="mono text-ink font-semibold">
                    {formatINRExact(Math.max(0, order.totalAmount - orderPayments.totalPaid))}
                  </span>
                </span>
                <StatusPill tone={paymentStatusTone(order.paymentStatus)}>
                  {order.paymentStatus.replace(/_/g, ' ')}
                </StatusPill>
              </div>
              {canRecordPayment &&
                order.totalAmount - orderPayments.totalPaid > 0 &&
                order.status !== 'cancelled' && (
                  <Link
                    href={`/payments/new?dealer=${order.billTo.id}`}
                    className="bg-ink rounded-[6px] px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
                  >
                    Record payment
                  </Link>
                )}
            </div>
          </section>
        )}

        {tab === 'history' && (
          <section className="border-line rounded-[6px] border bg-white p-5">
            {order.history.length === 0 ? (
              <p className="text-mute text-[12.5px]">No status changes recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-[12.5px]">
                {order.history.map((h) => (
                  <li key={h.id} className="border-line flex items-baseline gap-3 border-l-2 pl-3">
                    <span className="text-mute mono w-24 shrink-0 text-[11px]">
                      {h.transitionedAt.toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    <span className="text-ink">
                      {h.fromStatus ? `${h.fromStatus} → ` : ''}
                      <span className="font-medium">{h.toStatus}</span>
                      {h.actorName && <span className="text-mute"> · {h.actorName}</span>}
                      {h.reason && <span className="text-mute"> · {h.reason}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function RowKV({ label, value, mute }: { label: string; value: string; mute?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-mute text-[12px]">{label}</dt>
      <dd className={`mono text-[13px] tabular-nums ${mute ? 'text-mute' : 'text-ink'}`}>
        {value}
      </dd>
    </div>
  );
}
