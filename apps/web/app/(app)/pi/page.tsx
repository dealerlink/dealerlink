import { FileCheck } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/app/_components';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { listPerformaInvoices } from '@/lib/queries/performa-invoices';
import { impersonationTenantId } from '@/lib/tenant/context';
import { PI_STATUSES, type PerformaInvoiceStatus } from '@dealerlink/schemas';

import { piStatusTone } from './pi-status';

interface PageProps {
  searchParams: {
    search?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: string;
  };
}

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function PiListPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const statusFilter = searchParams.status
    ? (searchParams.status
        .split(',')
        .filter((s) => PI_STATUSES.includes(s as PerformaInvoiceStatus)) as PerformaInvoiceStatus[])
    : undefined;

  const result = await listPerformaInvoices(
    tenantId,
    {
      search: searchParams.search,
      status: statusFilter,
      from: searchParams.from,
      to: searchParams.to,
    },
    { limit: PAGE_SIZE, offset },
  );

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 py-5">
      <div className="mb-5">
        <div className="titlecaps mb-1">Performa Invoices</div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Performa Invoices</h1>
        <p className="text-mute mono mt-1 text-[13px]">
          {result.total.toLocaleString('en-IN')} total
        </p>
      </div>

      <form className="border-line mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border bg-white p-3">
        <input
          name="search"
          defaultValue={searchParams.search ?? ''}
          placeholder="Search by PI number…"
          className="border-line bg-paper focus:ring-accent h-8 w-64 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border-line bg-paper focus:ring-accent h-8 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        >
          <option value="">All statuses</option>
          {PI_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={searchParams.from ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        />
        <input
          type="date"
          name="to"
          defaultValue={searchParams.to ?? ''}
          className="border-line bg-paper h-8 rounded-[4px] border px-2 text-[13px]"
        />
        <button
          type="submit"
          className="border-line hover:bg-paper-2 h-8 rounded-[4px] border bg-white px-3 text-[13px]"
        >
          Filter
        </button>
        <Link
          href="/pi"
          className="text-mute hover:text-ink text-[12.5px] underline-offset-4 hover:underline"
        >
          Reset
        </Link>
      </form>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        {result.rows.length === 0 ? (
          (() => {
            const anyFilter = Boolean(
              searchParams.search || searchParams.status || searchParams.from || searchParams.to,
            );
            return anyFilter ? (
              <EmptyState
                icon={FileCheck}
                title="No performa invoices match these filters"
                description="Try widening the date range or clearing a filter."
                action={
                  <Button asChild variant="default">
                    <Link href="/pi">Clear filters</Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FileCheck}
                title="No performa invoices yet"
                description="A PI is created by converting an accepted quotation."
                action={
                  <Button asChild variant="default">
                    <Link href="/quotations?status=accepted">View accepted quotations</Link>
                  </Button>
                }
              />
            );
          })()
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">PI #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Dealer (Bill-To)</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Prepared by</th>
                <th className="px-4 py-3 font-medium">Deal</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((pi) => (
                <tr
                  key={pi.id}
                  className="border-line hover:bg-paper-2 h-[56px] border-b last:border-b-0"
                >
                  <td className="mono px-4 text-[12.5px]">
                    <Link href={`/pi/${pi.id}`} className="hover:underline">
                      {pi.piNumber}
                    </Link>
                  </td>
                  <td className="text-mute mono px-4 text-[12px]">
                    {formatDate(new Date(pi.piDate + 'T00:00:00Z'))}
                  </td>
                  <td className="text-ink px-4">
                    {pi.billToName}
                    {pi.threeParty && (
                      <span
                        className="text-mute ml-2 text-[11px]"
                        title={`Ship-To: ${pi.shipToName}`}
                      >
                        · ship → {pi.shipToName}
                      </span>
                    )}
                  </td>
                  <td className="mono text-ink px-4 text-right tabular-nums">
                    {formatINRExact(pi.totalAmount)}
                  </td>
                  <td className="px-4">
                    <StatusPill tone={piStatusTone(pi.status)}>{pi.status}</StatusPill>
                  </td>
                  <td className="text-mute px-4 text-[12.5px]">{pi.preparedByName}</td>
                  <td className="px-4">
                    {pi.dealId ? (
                      <Link
                        href={`/pipeline?deal=${pi.dealId}`}
                        className="text-mute hover:text-ink text-[12px] hover:underline"
                      >
                        linked
                      </Link>
                    ) : (
                      <span className="text-mute text-[12px]">—</span>
                    )}
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
                href={{ pathname: '/pi', query: { ...searchParams, page: page - 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/pi', query: { ...searchParams, page: page + 1 } }}
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
