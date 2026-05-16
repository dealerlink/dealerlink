import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { listOrders } from '@/lib/queries/orders';
import { impersonationTenantId } from '@/lib/tenant/context';
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  type OrderPaymentStatus,
  type OrderStatus,
} from '@dealerlink/schemas';

import { orderStatusTone, paymentStatusTone } from './order-status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: { search?: string; status?: string; payment?: string; page?: string };
}

export default async function OrdersPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const statusFilter = searchParams.status
    ? (searchParams.status
        .split(',')
        .filter((s) => ORDER_STATUSES.includes(s as OrderStatus)) as OrderStatus[])
    : undefined;
  const paymentFilter = searchParams.payment
    ? (searchParams.payment
        .split(',')
        .filter((s) =>
          ORDER_PAYMENT_STATUSES.includes(s as OrderPaymentStatus),
        ) as OrderPaymentStatus[])
    : undefined;

  const result = await listOrders(
    tenantId,
    { search: searchParams.search, status: statusFilter, paymentStatus: paymentFilter },
    { limit: PAGE_SIZE, offset },
  );
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 py-5">
      <div className="mb-5">
        <div className="titlecaps mb-1">Orders</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Orders</h1>
        <p className="text-mute mono mt-1 text-[13px]">
          {result.total.toLocaleString('en-IN')} total
        </p>
      </div>

      <form className="border-line mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border bg-white p-3">
        <input
          name="search"
          defaultValue={searchParams.search ?? ''}
          placeholder="Search by order number…"
          className="border-line bg-paper focus:ring-accent h-8 w-64 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          name="payment"
          defaultValue={searchParams.payment ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        >
          <option value="">All payment</option>
          {ORDER_PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="border-line hover:bg-paper-2 h-8 rounded-[4px] border bg-white px-3 text-[13px]"
        >
          Filter
        </button>
        <Link href="/orders" className="text-mute hover:text-ink text-[12.5px] hover:underline">
          Reset
        </Link>
      </form>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        {result.rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-mute mb-2 text-[13px]">No orders yet.</div>
            <p className="text-mute text-[12.5px]">
              An order is created when a{' '}
              <Link href="/pi" className="text-ink hover:underline">
                performa invoice
              </Link>{' '}
              is confirmed.
            </p>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">Order #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Dealer (Bill-To)</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Fulfilment</th>
                <th className="px-4 py-3 font-medium">Payment</th>
                <th className="px-4 py-3 font-medium">Expected dispatch</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((o) => (
                <tr
                  key={o.id}
                  className="border-line hover:bg-paper-2 h-[56px] border-b last:border-b-0"
                >
                  <td className="mono px-4 text-[12.5px]">
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="text-mute mono px-4 text-[12px]">
                    {formatDate(new Date(o.orderDate + 'T00:00:00Z'))}
                  </td>
                  <td className="text-ink px-4">{o.billToName}</td>
                  <td className="mono text-ink px-4 text-right tabular-nums">
                    {formatINRExact(o.totalAmount)}
                  </td>
                  <td className="px-4">
                    <StatusPill tone={orderStatusTone(o.status)}>
                      {o.status.replace(/_/g, ' ')}
                    </StatusPill>
                  </td>
                  <td className="px-4">
                    <StatusPill tone={paymentStatusTone(o.paymentStatus)}>
                      {o.paymentStatus.replace(/_/g, ' ')}
                    </StatusPill>
                  </td>
                  <td className="text-mute mono px-4 text-[12px]">
                    {o.expectedDispatchDate
                      ? formatDate(new Date(o.expectedDispatchDate + 'T00:00:00Z'))
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="text-mute mt-4 flex items-center justify-between text-[12.5px]">
          <div>
            Showing <span className="mono">{offset + 1}</span>–
            <span className="mono">{Math.min(offset + PAGE_SIZE, result.total)}</span> of{' '}
            <span className="mono">{result.total}</span>
          </div>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={{ pathname: '/orders', query: { ...searchParams, page: page - 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/orders', query: { ...searchParams, page: page + 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
