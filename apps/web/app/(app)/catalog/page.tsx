import { Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { getAuthContext } from '@/lib/auth/session';
import { formatINRExact } from '@/lib/format';
import { listProducts } from '@/lib/queries/products';
import { impersonationTenantId } from '@/lib/tenant/context';

import { ProductFilters } from './product-filters';

interface PageProps {
  searchParams: {
    search?: string;
    status?: string;
    category?: string;
    subcategory?: string;
    manufacturer?: string;
    view?: 'grid' | 'table';
    page?: string;
  };
}

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

function statusTone(s: string): StatusTone {
  if (s === 'active') return 'em';
  if (s === 'discontinued') return 'ro';
  return 'mu';
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const view = searchParams.view === 'table' ? 'table' : 'grid';

  const result = await listProducts(tenantId, {
    search: searchParams.search,
    status: searchParams.status as 'active' | 'inactive' | 'discontinued' | undefined,
    category: searchParams.category,
    subcategory: searchParams.subcategory,
    manufacturer: searchParams.manufacturer,
    limit: PAGE_SIZE,
    offset,
  });

  const canCreate = ctx.user.role === 'admin';

  return (
    <div className="px-6 py-5">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">Product Catalog</div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Catalog</h1>
          <p className="text-mute mt-1 text-[13px]">
            <span className="mono">{result.total.toLocaleString('en-IN')}</span> total
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/catalog/import">
                <Upload size={13} /> Bulk import
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/catalog/new">
                <Plus size={13} /> New product
              </Link>
            </Button>
          </div>
        )}
      </div>

      <ProductFilters
        initial={{
          search: searchParams.search ?? '',
          status: searchParams.status ?? '',
          manufacturer: searchParams.manufacturer ?? '',
          category: searchParams.category ?? '',
        }}
        currentView={view}
      />

      <div className="mt-4">
        {result.rows.length === 0 ? (
          <div className="border-line rounded-[6px] border bg-white px-6 py-16 text-center">
            <div className="text-mute text-[13px]">
              {searchParams.search ? 'No products match this search.' : 'No products yet.'}
            </div>
          </div>
        ) : view === 'table' ? (
          <div className="border-line overflow-hidden rounded-[6px] border bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Mfr</th>
                  <th className="px-4 py-3 font-medium">HSN</th>
                  <th className="px-4 py-3 text-right font-medium">GST</th>
                  <th className="px-4 py-3 text-right font-medium">MRP</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((p) => (
                  <tr
                    key={p.id}
                    className="border-line hover:bg-paper-2 h-[56px] border-b last:border-b-0"
                  >
                    <td className="mono px-4 text-[12.5px]">
                      <Link href={`/catalog/${p.id}`} className="hover:underline">
                        {p.sku}
                      </Link>
                    </td>
                    <td className="px-4">
                      <Link href={`/catalog/${p.id}`} className="block hover:underline">
                        <div className="text-ink font-medium">{p.name}</div>
                        <div className="text-mute text-[11.5px]">
                          {p.subcategory ?? p.category ?? '—'}
                        </div>
                      </Link>
                    </td>
                    <td className="text-mute px-4">{p.manufacturer ?? '—'}</td>
                    <td className="mono px-4 text-[12.5px]">{p.hsnCode}</td>
                    <td className="mono px-4 text-right">{p.gstRate}%</td>
                    <td className="mono px-4 text-right">
                      {p.mrp ? formatINRExact(Number(p.mrp)) : '—'}
                    </td>
                    <td className="px-4">
                      <StatusPill tone={statusTone(p.status)}>{p.status}</StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.rows.map((p) => (
              <Link
                key={p.id}
                href={`/catalog/${p.id}`}
                className="border-line hover:border-line-2 group rounded-[6px] border bg-white p-4 transition-colors"
              >
                <div className="bg-paper-2 mb-3 aspect-[4/3] rounded-[5px]" />
                <div className="text-ink line-clamp-1 text-[13px] font-medium">{p.name}</div>
                <div className="text-mute mt-0.5 line-clamp-1 text-[11.5px]">
                  {p.manufacturer ?? '—'}
                </div>
                <div className="mono text-mute mt-1 text-[11px]">{p.sku}</div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="bg-paper-2 text-mute mono rounded-[3px] px-1.5 py-[2px] text-[11px]">
                    HSN {p.hsnCode} · {p.gstRate}%
                  </span>
                  <StatusPill tone={statusTone(p.status)}>{p.status}</StatusPill>
                </div>
                {p.mrp && (
                  <div className="text-ink mono mt-2 text-[14px] font-semibold">
                    {formatINRExact(Number(p.mrp))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {(() => {
        const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
        if (totalPages <= 1) return null;
        return (
          <div className="text-mute mt-4 flex items-center justify-between text-[12.5px]">
            <div>
              Showing <span className="mono">{offset + 1}</span>–
              <span className="mono">{Math.min(offset + PAGE_SIZE, result.total)}</span> of{' '}
              <span className="mono">{result.total}</span>
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{ pathname: '/catalog', query: { ...searchParams, page: page - 1 } }}
                  className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
                >
                  ← Prev
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{ pathname: '/catalog', query: { ...searchParams, page: page + 1 } }}
                  className="border-line hover:bg-paper-2 rounded-[5px] border bg-white px-2 py-1"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
