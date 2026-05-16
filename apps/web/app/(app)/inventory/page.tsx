import { Box, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/app/_components';
import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { listInventory, inventoryDashboardStats } from '@/lib/queries/procurements';
import { impersonationTenantId } from '@/lib/tenant/context';

import { InventoryFilters } from './inventory-filters';

interface PageProps {
  searchParams: {
    search?: string;
    status?: string;
    productId?: string;
    procurementId?: string;
    page?: string;
  };
}

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 100;

const STATUS_TONE: Record<string, StatusTone> = {
  in_stock: 'em',
  reserved: 'am',
  dispatched: 'in',
  delivered: 'mu',
  returned: 'am',
  damaged: 'ro',
  lost: 'ro',
};

function fmtStatus(s: string) {
  return s.replace('_', ' ');
}

export default async function InventoryPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const status = searchParams.status as
    | 'in_stock'
    | 'reserved'
    | 'dispatched'
    | 'delivered'
    | 'returned'
    | 'damaged'
    | 'lost'
    | undefined;
  const result = await listInventory(tenantId, {
    ...(searchParams.search ? { search: searchParams.search } : {}),
    ...(status ? { status } : {}),
    ...(searchParams.productId ? { productId: searchParams.productId } : {}),
    ...(searchParams.procurementId ? { procurementId: searchParams.procurementId } : {}),
    limit: PAGE_SIZE,
    offset,
  });
  const stats = await inventoryDashboardStats(tenantId);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">Inventory</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Inventory</h1>
          <p className="text-mute mt-1 text-[13px]">
            <span className="mono">{result.total.toLocaleString('en-IN')}</span> serials
            {' · '}
            <span className="mono">{stats.counts['in_stock'] ?? 0}</span> in stock
            {' · '}
            <span className="mono">{stats.counts['reserved'] ?? 0}</span> reserved
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="primary">
            <Link href="/inventory/procurements/new">
              <Plus size={13} /> New procurement
            </Link>
          </Button>
        </div>
      </div>

      <InventoryFilters
        initial={{
          search: searchParams.search ?? '',
          status: searchParams.status ?? '',
        }}
      />

      <div className="border-line mt-4 overflow-hidden rounded-[6px] border bg-white">
        {result.rows.length === 0 ? (
          <EmptyState
            icon={Box}
            title={
              searchParams.search || searchParams.status || searchParams.productId
                ? 'No items match these filters'
                : 'No inventory yet'
            }
            description={
              searchParams.search || searchParams.status || searchParams.productId
                ? 'Try widening the search or clearing a filter.'
                : 'Inventory items are created when a procurement is received.'
            }
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-4 py-3 font-medium">Serial</th>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Warehouse</th>
                <th className="px-4 py-3 font-medium">Procurement</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-line hover:bg-paper-2 h-[56px] cursor-pointer border-b last:border-b-0"
                >
                  <td className="mono px-4 text-[12.5px]">
                    <Link href={`/inventory/${r.id}`} className="hover:underline">
                      {r.serialNumber ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4">
                    <div className="text-ink font-medium">{r.productName}</div>
                    <div className="text-mute mono text-[11.5px]">
                      {r.productSku} · {r.manufacturer ?? 'Unbranded'}
                    </div>
                  </td>
                  <td className="px-4">
                    <StatusPill tone={STATUS_TONE[r.status] ?? 'mu'}>
                      {fmtStatus(r.status)}
                    </StatusPill>
                  </td>
                  <td className="text-mute mono px-4 text-[12px]">{r.warehouseCode ?? '—'}</td>
                  <td className="mono px-4 text-[12px]">
                    {r.procurementNumber ? (
                      <Link
                        href={`/inventory/procurements/${r.procurementId}`}
                        className="hover:underline"
                      >
                        {r.procurementNumber}
                      </Link>
                    ) : (
                      <span className="text-mute">—</span>
                    )}
                  </td>
                  <td className="mono text-mute px-4 text-[11.5px]">{r.procurementDate ?? '—'}</td>
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
                href={{ pathname: '/inventory', query: { ...searchParams, page: page - 1 } }}
                className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
              >
                ← Prev
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={{ pathname: '/inventory', query: { ...searchParams, page: page + 1 } }}
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
