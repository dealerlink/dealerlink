import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { listPayments } from '@/lib/queries/payments';
import { impersonationTenantId } from '@/lib/tenant/context';
import { PAYMENT_METHODS, PAYMENT_STATUSES } from '@dealerlink/schemas';
import type { PaymentMethod, PaymentStatus } from '@dealerlink/schemas';

import { paymentMethodLabel, paymentStatusLabel, paymentStatusTone } from './payment-status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: { search?: string; status?: string; method?: string; page?: string };
}

export default async function PaymentsPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  // Payments are admin + accounts only — sales never sees the cash side.
  if (ctx.user.role === 'sales' || ctx.user.role === 'dispatch') redirect('/dashboard');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const canRecord = ctx.user.role === 'admin' || ctx.user.role === 'accounts';
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const statusFilter = searchParams.status
    ? (searchParams.status
        .split(',')
        .filter((s) => PAYMENT_STATUSES.includes(s as PaymentStatus)) as PaymentStatus[])
    : undefined;
  const methodFilter = searchParams.method
    ? (searchParams.method
        .split(',')
        .filter((s) => PAYMENT_METHODS.includes(s as PaymentMethod)) as PaymentMethod[])
    : undefined;

  const result = await listPayments(
    tenantId,
    { search: searchParams.search, status: statusFilter, method: methodFilter },
    { limit: PAGE_SIZE, offset },
  );
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="titlecaps mb-1">Payments</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Payments</h1>
          <p className="text-mute mono mt-1 text-[13px]">
            {result.total.toLocaleString('en-IN')} total
          </p>
        </div>
        {canRecord && (
          <Link
            href="/payments/new"
            className="bg-ink h-9 rounded-[6px] px-4 text-[13px] font-medium leading-9 text-white hover:opacity-90"
          >
            Record payment
          </Link>
        )}
      </div>

      <form className="border-line mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border bg-white p-3">
        <input
          name="search"
          defaultValue={searchParams.search ?? ''}
          placeholder="Search by payment number…"
          className="border-line bg-paper focus:ring-accent h-8 w-64 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        >
          <option value="">All statuses</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {paymentStatusLabel(s)}
            </option>
          ))}
        </select>
        <select
          name="method"
          defaultValue={searchParams.method ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        >
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {paymentMethodLabel(m)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="border-line hover:bg-paper-2 h-8 rounded-[4px] border bg-white px-3 text-[13px]"
        >
          Filter
        </button>
        <Link href="/payments" className="text-mute hover:text-ink text-[12.5px] hover:underline">
          Reset
        </Link>
      </form>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        {result.rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-mute mb-2 text-[13px]">No payments yet.</div>
            {canRecord && (
              <p className="text-mute text-[12.5px]">
                Use{' '}
                <Link href="/payments/new" className="text-ink hover:underline">
                  Record payment
                </Link>{' '}
                to log a receipt.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">Payment #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Dealer</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Allocated</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((p) => {
                const pct =
                  p.amount > 0
                    ? Math.min(100, Math.round((p.allocatedAmount / p.amount) * 100))
                    : 0;
                return (
                  <tr
                    key={p.id}
                    className="border-line hover:bg-paper-2 h-[56px] border-b last:border-b-0"
                  >
                    <td className="mono px-4 text-[12.5px]">
                      <Link href={`/payments/${p.id}`} className="hover:underline">
                        {p.paymentNumber}
                      </Link>
                    </td>
                    <td className="text-mute mono px-4 text-[12px]">
                      {formatDate(new Date(p.receivedDate + 'T00:00:00Z'))}
                    </td>
                    <td className="text-ink px-4">{p.dealerName}</td>
                    <td className="mono text-ink px-4 text-right tabular-nums">
                      {formatINRExact(p.amount)}
                    </td>
                    <td className="text-mute px-4 text-[12.5px]">{paymentMethodLabel(p.method)}</td>
                    <td className="px-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-paper-2 h-1.5 w-20 overflow-hidden rounded-full">
                          <div
                            className="bg-accent h-full rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-mute mono text-[11px]">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4">
                      <StatusPill tone={paymentStatusTone(p.status)}>
                        {paymentStatusLabel(p.status)}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
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
                href={{ pathname: '/payments', query: { ...searchParams, page: page - 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/payments', query: { ...searchParams, page: page + 1 } }}
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
