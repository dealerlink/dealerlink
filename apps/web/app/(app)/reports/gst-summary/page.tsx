import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import {
  assertReportAccess,
  FISCAL_QUARTERS,
  fiscalQuarterOf,
  fiscalYearOf,
  gstSummaryReport,
  fiscalQuarterRange,
  type FiscalQuarter,
} from '@/lib/reports';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DownloadCsv } from '../_components/download-csv';
import { FilterBar, type FilterField } from '../_components/filter-bar';
import { ReportTable } from '../_components/report-table';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'GST Summary' };

interface PageProps {
  searchParams: { quarter?: string; supplyType?: string };
}

export default async function GstSummaryPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  assertReportAccess(ctx.user.role, 'gst-summary');

  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const fy = fiscalYearOf();
  const quarter: FiscalQuarter = FISCAL_QUARTERS.some((q) => q.key === searchParams.quarter)
    ? (searchParams.quarter as FiscalQuarter)
    : fiscalQuarterOf();
  const supplyType =
    searchParams.supplyType === 'intra' || searchParams.supplyType === 'inter'
      ? searchParams.supplyType
      : undefined;

  const range = fiscalQuarterRange(fy, quarter);
  const result = await gstSummaryReport(tenantId, { ...range, supplyType });

  const fields: FilterField[] = [
    {
      kind: 'select',
      name: 'quarter',
      label: 'Fiscal quarter',
      required: true,
      options: FISCAL_QUARTERS.map((q) => ({ value: q.key, label: q.label })),
    },
    {
      kind: 'select',
      name: 'supplyType',
      label: 'Supply type',
      options: [
        { value: 'intra', label: 'Intra-state' },
        { value: 'inter', label: 'Inter-state' },
      ],
    },
  ];

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="titlecaps mb-1">
            <Link href="/reports" className="hover:underline">
              Reports
            </Link>{' '}
            / GST Summary
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">GST Summary</h1>
          <p className="text-mute mt-1 text-[13px]">
            FY {fy}–{fy + 1} · {result.metadata.filterLabel} · supplied orders only — figures read
            from stored tax columns.
          </p>
        </div>
        <DownloadCsv report="gst-summary" params={{ quarter, supplyType: supplyType ?? '' }} />
      </div>

      <FilterBar
        basePath="/reports/gst-summary"
        fields={fields}
        values={{ quarter, supplyType: supplyType ?? '' }}
      />

      <ReportTable result={result} />
    </div>
  );
}
