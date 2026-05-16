/**
 * Report query layer — shared types.
 *
 * Every report is a pure typed function `(tenantId, filters) => ReportResult`.
 * The `ReportResult` shape drives both the on-screen TanStack-style table and
 * the CSV export (`./csv.ts`), so a report is defined once and rendered twice.
 *
 * CLAUDE.md §6 contract: reports NEVER recompute taxes or money. Report
 * queries READ stored columns (`cgst_amount`, `sgst_amount`, `igst_amount`,
 * `total_amount`, …). Any drift between a report and the underlying rows is a
 * Day 9/11 bug to surface — not something a report silently corrects.
 */

/** Column value semantics — drives alignment, font, and CSV formatting. */
export type ReportColumnType = 'text' | 'integer' | 'money' | 'date';

export interface ReportColumn {
  key: string;
  label: string;
  type: ReportColumnType;
}

/** A single cell. `null` renders as an em-dash and exports as empty. */
export type ReportCell = string | number | null;

export type ReportRow = Record<string, ReportCell>;

export interface ReportMetadata {
  /** Stable key — used for CSV filenames and access control. */
  reportKey: string;
  /** Human-readable report name. */
  reportName: string;
  /** ISO timestamp the report was generated. */
  generatedAt: string;
  /** Short description of the applied filters, for the CSV header + UI. */
  filterLabel: string;
  /** Number of data rows (excludes the totals row). */
  rowCount: number;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Totals/footer row. `null` when a totals row is not meaningful. */
  totals: ReportRow | null;
  metadata: ReportMetadata;
}

/** Report identifiers — keep in sync with `./access.ts` and the route folders. */
export type ReportKey = 'sales-summary' | 'outstanding' | 'inventory-valuation' | 'gst-summary';
