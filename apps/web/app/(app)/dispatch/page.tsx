import Link from 'next/link';
import { redirect } from 'next/navigation';

import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate } from '@/lib/format';
import { listDispatches } from '@/lib/queries/dispatch';
import { impersonationTenantId } from '@/lib/tenant/context';
import { DISPATCH_STATUSES } from '@dealerlink/schemas';
import type { DispatchStatus } from '@dealerlink/schemas';

import { dispatchStatusLabel, dispatchStatusTone } from './dispatch-status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: {
    search?: string;
    status?: string;
    transporter?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}

export default async function DispatchPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  // Dispatch is the warehouse surface — admin + dispatch manage it, accounts
  // may view for reconciliation. Sales has no business here (Day 12 pattern).
  if (ctx.user.role === 'sales') redirect('/dashboard');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const role = ctx.user.role;
  const canCreate = role === 'admin' || role === 'dispatch';

  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const statusFilter = searchParams.status
    ? (searchParams.status
        .split(',')
        .filter((s) => DISPATCH_STATUSES.includes(s as DispatchStatus)) as DispatchStatus[])
    : undefined;

  const result = await listDispatches(
    tenantId,
    {
      search: searchParams.search,
      status: statusFilter,
      transporter: searchParams.transporter,
      from: searchParams.from,
      to: searchParams.to,
    },
    { limit: PAGE_SIZE, offset },
  );
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <div className="titlecaps mb-1">Dispatch</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Dispatch</h1>
          <p className="text-mute mono mt-1 text-[13px]">
            {result.total.toLocaleString('en-IN')} total
          </p>
        </div>
        {canCreate && (
          <Link
            href="/dispatch/new"
            className="bg-ink h-9 rounded-[6px] px-4 text-[13px] font-medium leading-9 text-white hover:opacity-90"
          >
            + New dispatch
          </Link>
        )}
      </div>

      <form className="border-line mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border bg-white p-3">
        <input
          name="search"
          defaultValue={searchParams.search ?? ''}
          placeholder="Search by dispatch number…"
          className="border-line bg-paper focus:ring-accent h-8 w-56 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        >
          <option value="">All statuses</option>
          {DISPATCH_STATUSES.map((s) => (
            <option key={s} value={s}>
              {dispatchStatusLabel(s)}
            </option>
          ))}
        </select>
        <input
          name="transporter"
          defaultValue={searchParams.transporter ?? ''}
          placeholder="Transporter"
          className="border-line bg-paper focus:ring-accent h-8 w-40 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <input
          name="from"
          type="date"
          defaultValue={searchParams.from ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        />
        <input
          name="to"
          type="date"
          defaultValue={searchParams.to ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        />
        <button
          type="submit"
          className="border-line hover:bg-paper-2 h-8 rounded-[4px] border bg-white px-3 text-[13px]"
        >
          Filter
        </button>
        <Link href="/dispatch" className="text-mute hover:text-ink text-[12.5px] hover:underline">
          Reset
        </Link>
      </form>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        {result.rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-mute mb-2 text-[13px]">No dispatches yet.</div>
            {canCreate && (
              <p className="text-mute text-[12.5px]">
                Use{' '}
                <Link href="/dispatch/new" className="text-ink hover:underline">
                  New dispatch
                </Link>{' '}
                to ship inventory against a confirmed order.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">Dispatch #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Ship to</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Transporter</th>
                <th className="px-4 py-3 text-right font-medium">Serials</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((d) => (
                <tr
                  key={d.id}
                  className="border-line hover:bg-paper-2 h-[52px] border-b last:border-b-0"
                >
                  <td className="mono px-4 text-[12.5px]">
                    <Link href={`/dispatch/${d.id}`} className="hover:underline">
                      {d.dispatchNumber}
                    </Link>
                  </td>
                  <td className="text-mute mono px-4 text-[12px]">
                    {formatDate(new Date(d.dispatchDate + 'T00:00:00Z'))}
                  </td>
                  <td className="mono px-4 text-[12.5px]">
                    <Link href={`/orders/${d.orderId}`} className="text-ink hover:underline">
                      {d.orderNumber}
                    </Link>
                  </td>
                  <td className="text-ink px-4">{d.shipToName}</td>
                  <td className="text-mute mono px-4 text-[12px]">{d.vehicleNumber ?? '—'}</td>
                  <td className="text-mute px-4 text-[12.5px]">{d.transporterName ?? '—'}</td>
                  <td className="mono text-ink px-4 text-right tabular-nums">{d.serialCount}</td>
                  <td className="px-4">
                    <StatusPill tone={dispatchStatusTone(d.status)}>
                      {dispatchStatusLabel(d.status)}
                    </StatusPill>
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
                href={{ pathname: '/dispatch', query: { ...searchParams, page: page - 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/dispatch', query: { ...searchParams, page: page + 1 } }}
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
