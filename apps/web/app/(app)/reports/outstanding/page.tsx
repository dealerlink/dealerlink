import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/auth/session';
import { assertReportAccess, outstandingReport, type OutstandingGroupBy } from '@/lib/reports';
import { impersonationTenantId } from '@/lib/tenant/context';

import { DownloadCsv } from '../_components/download-csv';
import { FilterBar, type FilterField } from '../_components/filter-bar';
import { ReportTable } from '../_components/report-table';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { groupBy?: string };
}

export default async function OutstandingPage({ searchParams }: PageProps) {
  const ctx = await getAuthContext();
  if (!ctx) redirect('/login');
  assertReportAccess(ctx.user.role, 'outstanding');

  const tenantId = ctx.user.tenantId ?? impersonationTenantId();
  if (!tenantId) redirect('/login');

  const groupBy: OutstandingGroupBy = searchParams.groupBy === 'bucket' ? 'bucket' : 'dealer';

  const result = await outstandingReport(tenantId, { groupBy });

  const fields: FilterField[] = [
    {
      kind: 'select',
      name: 'groupBy',
      label: 'Group by',
      required: true,
      options: [
        { value: 'dealer', label: 'Dealer' },
        { value: 'bucket', label: 'Aging bucket' },
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
            / Outstanding Receivables
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Outstanding Receivables</h1>
          <p className="text-mute mt-1 text-[13px]">{result.metadata.filterLabel}</p>
        </div>
        <DownloadCsv report="outstanding" params={{ groupBy }} />
      </div>

      <FilterBar basePath="/reports/outstanding" fields={fields} values={{ groupBy }} />

      <ReportTable result={result} />
    </div>
  );
}
