import { products, withTenant } from '@dealerlink/db';
import { isNotNull, sql } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { assertReportAccess, inventoryValuationReport } from '@/lib/reports';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DownloadCsv } from '../_components/download-csv';
import { FilterBar, type FilterField } from '../_components/filter-bar';
import { ReportTable } from '../_components/report-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Inventory Valuation' };

interface PageProps {
  searchParams: { category?: string; lowStock?: string };
}

export default async function InventoryValuationPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  assertReportAccess(ctx.user.role, 'inventory-valuation');

  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const lowStockOnly = searchParams.lowStock === '1';

  const [categories, result] = await Promise.all([
    withTenant(tenantId, async (tx) => {
      const rows = await tx
        .selectDistinct({ category: products.category })
        .from(products)
        .where(isNotNull(products.category))
        .orderBy(sql`1`);
      return rows.map((r) => r.category).filter((c): c is string => !!c);
    }),
    inventoryValuationReport(tenantId, {
      category: searchParams.category || undefined,
      lowStockOnly,
    }),
  ]);

  const fields: FilterField[] = [
    {
      kind: 'select',
      name: 'category',
      label: 'Category',
      options: categories.map((c) => ({ value: c, label: c })),
    },
    { kind: 'toggle', name: 'lowStock', label: 'Low stock only' },
  ];

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">
            <Link href="/reports" className="hover:underline">
              Reports
            </Link>{' '}
            / Inventory Valuation
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Inventory Valuation</h1>
          <p className="text-mute mt-1 text-[13px]">
            {result.metadata.filterLabel} · cost basis is the last procurement price (FIFO is Phase
            2).
          </p>
        </div>
        <DownloadCsv
          report="inventory-valuation"
          params={{ category: searchParams.category ?? '', lowStock: lowStockOnly ? '1' : '' }}
        />
      </div>

      <FilterBar
        basePath="/reports/inventory-valuation"
        fields={fields}
        values={{ category: searchParams.category ?? '', lowStock: lowStockOnly ? '1' : '' }}
      />

      <ReportTable result={result} />
    </div>
  );
}
