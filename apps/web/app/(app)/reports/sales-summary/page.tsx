import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { listDealerOptions } from '@/lib/queries/payments';
import {
  assertReportAccess,
  fiscalYearOf,
  fiscalYearRange,
  salesSummaryReport,
  type SalesGroupBy,
} from '@/lib/reports';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DownloadCsv } from '../_components/download-csv';
import { FilterBar, type FilterField } from '../_components/filter-bar';
import { ReportTable } from '../_components/report-table';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: {
    from?: string;
    to?: string;
    groupBy?: string;
    dealer?: string;
    status?: string;
  };
}

const GROUP_OPTIONS = [
  { value: 'month', label: 'Month' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'product', label: 'Product' },
];

const STATUS_OPTIONS = [
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'delivered', label: 'Delivered' },
];

export default async function SalesSummaryPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  assertReportAccess(ctx.user.role, 'sales-summary');

  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const fy = fiscalYearOf();
  const fyRange = fiscalYearRange(fy);
  const from = searchParams.from || fyRange.from;
  const to = searchParams.to || fyRange.to;
  const groupBy: SalesGroupBy = (['month', 'dealer', 'product'] as const).includes(
    searchParams.groupBy as SalesGroupBy,
  )
    ? (searchParams.groupBy as SalesGroupBy)
    : 'month';

  const [dealers, result] = await Promise.all([
    listDealerOptions(tenantId),
    salesSummaryReport(tenantId, {
      from,
      to,
      groupBy,
      status: searchParams.status,
      dealerId: searchParams.dealer,
    }),
  ]);

  const fields: FilterField[] = [
    { kind: 'date', name: 'from', label: 'From' },
    { kind: 'date', name: 'to', label: 'To' },
    {
      kind: 'select',
      name: 'groupBy',
      label: 'Group by',
      required: true,
      options: GROUP_OPTIONS,
    },
    {
      kind: 'select',
      name: 'dealer',
      label: 'Dealer',
      options: dealers.map((d) => ({ value: d.id, label: d.name })),
    },
    { kind: 'select', name: 'status', label: 'Status', options: STATUS_OPTIONS },
  ];

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">
            <Link href="/reports" className="hover:underline">
              Reports
            </Link>{' '}
            / Sales Summary
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Sales Summary</h1>
          <p className="text-mute mt-1 text-[13px]">{result.metadata.filterLabel}</p>
        </div>
        <DownloadCsv
          report="sales-summary"
          params={{
            from,
            to,
            groupBy,
            dealer: searchParams.dealer ?? '',
            status: searchParams.status ?? '',
          }}
        />
      </div>

      <FilterBar
        basePath="/reports/sales-summary"
        fields={fields}
        values={{
          from,
          to,
          groupBy,
          dealer: searchParams.dealer ?? '',
          status: searchParams.status ?? '',
        }}
      />

      <ReportTable result={result} />
    </div>
  );
}
