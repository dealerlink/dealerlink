/** Report query layer — public surface. */
export type {
  ReportColumn,
  ReportColumnType,
  ReportCell,
  ReportRow,
  ReportResult,
  ReportMetadata,
  ReportKey,
} from './types';
export {
  reportsForRole,
  canAccessReport,
  assertReportAccess,
  REPORT_TITLES,
  REPORT_DESCRIPTIONS,
  type ReportRole,
} from './access';
export {
  isoDate,
  fiscalYearOf,
  fiscalYearRange,
  fiscalQuarterOf,
  fiscalQuarterRange,
  FISCAL_QUARTERS,
  type FiscalQuarter,
} from './period';
export { salesSummaryReport, type SalesSummaryFilters, type SalesGroupBy } from './sales-summary';
export { outstandingReport, type OutstandingFilters, type OutstandingGroupBy } from './outstanding';
export { inventoryValuationReport, type InventoryValuationFilters } from './inventory-valuation';
export { gstSummaryReport, GST_SUPPLY_STATUSES, type GstSummaryFilters } from './gst-summary';
export { reportToCsv, csvFilename } from './csv';
export { runReport, reportPeriodToken, type ReportParams } from './resolve';
