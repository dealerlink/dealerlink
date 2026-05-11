import { Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatINRExact } from '@/lib/format';
import { listDealers } from '@/lib/queries/dealers';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DealerFilters } from './dealer-filters';

interface PageProps {
  searchParams: {
    search?: string;
    status?: string;
    type?: string;
    category?: string;
    riskLevel?: string;
    state?: string;
    page?: string;
  };
}

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function statusTone(s: string): StatusTone {
  if (s === 'active') return 'em';
  if (s === 'on_hold') return 'am';
  return 'mu';
}

function riskTone(r: string): StatusTone {
  if (r === 'high') return 'ro';
  if (r === 'medium') return 'am';
  return 'em';
}

export default async function DealersPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const result = await listDealers(tenantId, {
    search: searchParams.search,
    status: searchParams.status as 'active' | 'inactive' | 'on_hold' | undefined,
    type: searchParams.type as
      | 'retailer'
      | 'wholesaler'
      | 'installer'
      | 'epc'
      | 'other'
      | undefined,
    category: searchParams.category as 'A' | 'B' | 'C' | undefined,
    riskLevel: searchParams.riskLevel as 'low' | 'medium' | 'high' | undefined,
    state: searchParams.state,
    limit: PAGE_SIZE,
    offset,
  });

  const canCreate = ctx.user.role === 'admin' || ctx.user.role === 'sales';
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">Dealer Master</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Dealers</h1>
          <p className="text-mute mt-1 text-[13px]">
            <span className="mono">{result.total.toLocaleString('en-IN')}</span> total
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button asChild variant="default">
              <Link href="/dealers/import">
                <Upload size={13} /> Bulk import
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/dealers/new">
                <Plus size={13} /> New dealer
              </Link>
            </Button>
          </div>
        )}
      </div>

      <DealerFilters
        initial={{
          search: searchParams.search ?? '',
          status: searchParams.status ?? '',
          type: searchParams.type ?? '',
          category: searchParams.category ?? '',
          riskLevel: searchParams.riskLevel ?? '',
        }}
      />

      <div className="border-line mt-4 overflow-hidden rounded-[6px] border bg-white">
        {result.rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="text-mute text-[13px]">
              {searchParams.search ? 'No dealers match this search.' : 'No dealers yet.'}
            </div>
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Cat</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 text-right font-medium">Credit limit</th>
                <th className="px-4 py-3 text-right font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((d) => (
                <tr
                  key={d.id}
                  className="border-line hover:bg-paper-2 h-[56px] cursor-pointer border-b last:border-b-0"
                >
                  <td className="mono px-4 text-[12.5px]">
                    <Link href={`/dealers/${d.id}`} className="hover:underline">
                      {d.dealerCode}
                    </Link>
                  </td>
                  <td className="px-4">
                    <Link href={`/dealers/${d.id}`} className="block hover:underline">
                      <div className="text-ink font-medium">{d.displayName}</div>
                      <div className="text-mute mono text-[11.5px]">
                        {d.gstin ?? '—'} · {d.state ?? '—'}
                      </div>
                    </Link>
                  </td>
                  <td className="text-mute px-4 capitalize">{d.type}</td>
                  <td className="mono px-4">{d.category}</td>
                  <td className="px-4">
                    <StatusPill tone={riskTone(d.riskLevel)}>{d.riskLevel}</StatusPill>
                  </td>
                  <td className="mono px-4 text-right">
                    {d.creditLimit ? formatINRExact(Number(d.creditLimit)) : '—'}
                  </td>
                  <td className="mono text-mute px-4 text-right">
                    {d.creditPeriodDays != null ? `${d.creditPeriodDays}d` : '—'}
                  </td>
                  <td className="px-4">
                    <StatusPill tone={statusTone(d.status)}>
                      {d.status.replace('_', ' ')}
                    </StatusPill>
                  </td>
                  <td className="mono text-mute px-4 text-[11.5px]">
                    {d.updatedAt.toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
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
                href={{ pathname: '/dealers', query: { ...searchParams, page: page - 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/dealers', query: { ...searchParams, page: page + 1 } }}
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
