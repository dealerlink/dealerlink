import { FileText, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/app/_components';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatDate, formatINRExact } from '@/lib/format';
import { listQuotations } from '@/lib/queries/quotations';
import { impersonationTenantId } from '@/lib/tenant/context';
import type { QuotationStatus } from '@dealerlink/schemas';
import { QUOTATION_STATUSES } from '@dealerlink/schemas';

interface PageProps {
  searchParams: {
    search?: string;
    status?: string;
    dealerId?: string;
    preparedBy?: string;
    from?: string;
    to?: string;
    superseded?: string;
    page?: string;
  };
}

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function statusTone(s: QuotationStatus): StatusTone {
  switch (s) {
    case 'draft':
      return 'mu';
    case 'sent':
      return 'in';
    case 'accepted':
      return 'em';
    case 'rejected':
      return 'ro';
    case 'expired':
      return 'am';
    case 'superseded':
      return 'mu';
    default:
      return 'mu';
  }
}

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00Z').getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((target - today) / 86_400_000);
}

export default async function QuotationsPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const statusFilter = searchParams.status
    ? (searchParams.status
        .split(',')
        .filter((s) => QUOTATION_STATUSES.includes(s as QuotationStatus)) as QuotationStatus[])
    : undefined;

  const result = await listQuotations(
    tenantId,
    {
      search: searchParams.search,
      status: statusFilter,
      dealerId: searchParams.dealerId,
      preparedBy: searchParams.preparedBy,
      from: searchParams.from,
      to: searchParams.to,
      includeSuperseded: searchParams.superseded === '1',
    },
    { limit: PAGE_SIZE, offset },
  );

  const canCreate = ctx.user.role === 'admin' || ctx.user.role === 'sales';
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">Quotation Module</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Quotations</h1>
          <p className="text-mute mono mt-1 text-[13px]">
            {result.total.toLocaleString('en-IN')} total
          </p>
        </div>
        {canCreate && (
          <Button asChild variant="primary">
            <Link href="/quotations/new">
              <Plus size={13} /> New quotation
            </Link>
          </Button>
        )}
      </div>

      <form className="border-line mb-4 flex flex-wrap items-center gap-2 rounded-[6px] border bg-white p-3">
        <input
          name="search"
          defaultValue={searchParams.search ?? ''}
          placeholder="Search by quote number…"
          className="border-line bg-paper focus:ring-accent h-8 w-64 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <select
          name="status"
          defaultValue={searchParams.status ?? ''}
          className="border-line bg-paper focus:ring-accent h-8 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        >
          <option value="">All statuses</option>
          {QUOTATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={searchParams.from ?? ''}
          className="border-line bg-paper focus:ring-accent h-8 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <input
          type="date"
          name="to"
          defaultValue={searchParams.to ?? ''}
          className="border-line bg-paper focus:ring-accent h-8 rounded-[4px] border px-2 text-[13px] focus:outline-none focus:ring-1"
        />
        <label className="text-mute inline-flex items-center gap-1 text-[12.5px]">
          <input
            type="checkbox"
            name="superseded"
            value="1"
            defaultChecked={searchParams.superseded === '1'}
          />
          Include superseded
        </label>
        <Button type="submit" variant="default" size="sm">
          Filter
        </Button>
        <Link
          href="/quotations"
          className="text-mute hover:text-ink text-[12.5px] underline-offset-4 hover:underline"
        >
          Reset
        </Link>
      </form>

      <div className="border-line overflow-hidden rounded-[6px] border bg-white">
        {result.rows.length === 0 ? (
          (() => {
            const anyFilter = Boolean(
              searchParams.search ||
              searchParams.status ||
              searchParams.dealerId ||
              searchParams.preparedBy ||
              searchParams.from ||
              searchParams.to ||
              searchParams.superseded,
            );
            return (
              <EmptyState
                icon={FileText}
                title={anyFilter ? 'No quotations match these filters' : 'No quotations yet'}
                description={
                  anyFilter
                    ? 'Try widening the date range or clearing a filter.'
                    : 'Create your first quotation to start a deal.'
                }
                action={
                  anyFilter ? (
                    <Button asChild variant="default">
                      <Link href="/quotations">Clear filters</Link>
                    </Button>
                  ) : canCreate ? (
                    <Button asChild variant="primary">
                      <Link href="/quotations/new">
                        <Plus size={13} /> New quotation
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            );
          })()
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">Quote #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Dealer</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Prepared by</th>
                <th className="px-4 py-3 font-medium">Valid until</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((q) => {
                const days = daysUntil(q.validUntil);
                const expiring = q.status === 'sent' && days >= 0 && days <= 3;
                const expired = q.status === 'sent' && days < 0;
                return (
                  <tr
                    key={q.id}
                    className="border-line hover:bg-paper-2 h-[56px] border-b last:border-b-0"
                  >
                    <td className="mono px-4 text-[12.5px]">
                      <Link href={`/quotations/${q.id}`} className="hover:underline">
                        {q.quoteNumber}
                      </Link>
                      {q.revision > 1 && (
                        <span className="text-mute ml-2 text-[11px]">Rev {q.revision}</span>
                      )}
                    </td>
                    <td className="text-mute mono px-4 text-[12px]">
                      {formatDate(new Date(q.quoteDate + 'T00:00:00Z'))}
                    </td>
                    <td className="text-ink px-4">{q.dealerName}</td>
                    <td className="mono text-ink px-4 text-right tabular-nums">
                      {formatINRExact(q.totalAmount)}
                    </td>
                    <td className="px-4">
                      <StatusPill tone={statusTone(q.status)}>{q.status}</StatusPill>
                    </td>
                    <td className="text-mute px-4 text-[12.5px]">{q.preparedByName}</td>
                    <td className="px-4">
                      <div className="mono text-mute text-[12px]">
                        {formatDate(new Date(q.validUntil + 'T00:00:00Z'))}
                      </div>
                      {expired && <div className="text-[11px] text-rose-700">expired</div>}
                      {expiring && (
                        <div className="text-[11px] text-amber-700">expires in {days}d</div>
                      )}
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
                href={{ pathname: '/quotations', query: { ...searchParams, page: page - 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/quotations', query: { ...searchParams, page: page + 1 } }}
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
