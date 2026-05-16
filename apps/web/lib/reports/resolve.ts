/**
 * Single source of truth for turning URL search params into a `ReportResult`.
 *
 * Both the report pages (Server Components) and the CSV export action call
 * `runReport`, so a "Download CSV" always reflects exactly what is on screen
 * — the query is re-run server-side, never re-derived on the client.
 */
import { gstSummaryReport } from './gst-summary';
import { inventoryValuationReport } from './inventory-valuation';
import { outstandingReport, type OutstandingGroupBy } from './outstanding';
import {
  FISCAL_QUARTERS,
  fiscalQuarterOf,
  fiscalQuarterRange,
  fiscalYearOf,
  fiscalYearRange,
  type FiscalQuarter,
} from './period';
import { salesSummaryReport, type SalesGroupBy } from './sales-summary';
import type { ReportKey, ReportResult } from './types';

export type ReportParams = Record<string, string | undefined>;

const SALES_GROUPS: SalesGroupBy[] = ['month', 'dealer', 'product'];

function isQuarter(v: string | undefined): v is FiscalQuarter {
  return FISCAL_QUARTERS.some((q) => q.key === v);
}

/** Run one report from raw params, applying every default. */
export async function runReport(
  tenantId: string,
  report: ReportKey,
  params: ReportParams,
): Promise<ReportResult> {
  switch (report) {
    case 'sales-summary': {
      const fyRange = fiscalYearRange(fiscalYearOf());
      const groupBy = SALES_GROUPS.includes(params.groupBy as SalesGroupBy)
        ? (params.groupBy as SalesGroupBy)
        : 'month';
      return salesSummaryReport(tenantId, {
        from: params.from || fyRange.from,
        to: params.to || fyRange.to,
        groupBy,
        status: params.status || undefined,
        dealerId: params.dealer || undefined,
        preparedBy: params.preparedBy || undefined,
      });
    }
    case 'outstanding': {
      const groupBy: OutstandingGroupBy = params.groupBy === 'bucket' ? 'bucket' : 'dealer';
      return outstandingReport(tenantId, { groupBy });
    }
    case 'inventory-valuation': {
      return inventoryValuationReport(tenantId, {
        category: params.category || undefined,
        lowStockOnly: params.lowStock === '1',
      });
    }
    case 'gst-summary': {
      const fy = Number(params.fy) || fiscalYearOf();
      const quarter = isQuarter(params.quarter) ? params.quarter : fiscalQuarterOf();
      const range = fiscalQuarterRange(fy, quarter);
      const supplyType =
        params.supplyType === 'intra' || params.supplyType === 'inter'
          ? params.supplyType
          : undefined;
      return gstSummaryReport(tenantId, { ...range, supplyType });
    }
  }
}

/** A short period token for CSV filenames (e.g. `2026-Q1`, `2026-FY`). */
export function reportPeriodToken(report: ReportKey, params: ReportParams): string {
  if (report === 'gst-summary') {
    const fy = Number(params.fy) || fiscalYearOf();
    const quarter = isQuarter(params.quarter) ? params.quarter : fiscalQuarterOf();
    return `${fy}-${quarter}`;
  }
  if (report === 'sales-summary' && (params.from || params.to)) {
    return `${params.from ?? ''}_${params.to ?? ''}`;
  }
  if (report === 'sales-summary') return `${fiscalYearOf()}-FY`;
  return new Date().toISOString().slice(0, 10);
}
