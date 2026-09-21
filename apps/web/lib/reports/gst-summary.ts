/**
 * REPORT 4 — GST Summary (compliance-critical).
 *
 * CGST / SGST / IGST on supplied orders, grouped by place of supply. Only
 * orders that count as a *supply* are included — confirmed, partially /
 * fully dispatched and delivered. Pending and cancelled orders are excluded.
 *
 * CRITICAL (CLAUDE.md §6): every figure is the order's STORED
 * `taxable_amount` / `cgst_amount` / `sgst_amount` / `igst_amount`. This
 * report must NOT call @dealerlink/tax. If the totals disagree with the
 * tax engine's reading, that is a Day 9/11 bug for the engine to own — this
 * report only surfaces what was persisted (it is the GSTR-1 base).
 *
 * Supply type follows the §6 rule: intra-state when the tenant's state at
 * issue equals the place of supply, inter-state otherwise.
 */
import { withTenant } from '@dealerlink/db';
import { formatStateLabel } from '@dealerlink/schemas';
import { sql } from 'drizzle-orm';

import type { ReportColumn, ReportResult, ReportRow } from './types';

/** Order statuses that represent an actual supply for GST purposes. */
export const GST_SUPPLY_STATUSES = [
  'confirmed',
  'partially_dispatched',
  'fully_dispatched',
  'delivered',
] as const;

/**
 * How the report is grouped (F.3, day prompt D-4).
 *
 * `state` is the original and the default — one row per place of supply, with the
 * stored CGST/SGST/IGST columns. `rate` and `hsn` are the axis the prospect's
 * Tally ledgers are organised on, and they carry **no tax amounts**; see
 * `RATE_COLUMNS` for why that is a contract and not an omission.
 */
export type GstSummaryGroupBy = 'state' | 'rate' | 'hsn';

export interface GstSummaryFilters {
  from: string;
  to: string;
  /** Restrict to a supply type. */
  supplyType?: 'intra' | 'inter' | undefined;
  /** Default `'state'`. */
  groupBy?: GstSummaryGroupBy | undefined;
}

interface GstRow extends Record<string, unknown> {
  place_of_supply: string;
  is_inter: boolean;
  order_count: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
}

interface RateRow extends Record<string, unknown> {
  bucket: string;
  is_inter: boolean;
  order_count: string;
  line_value: string;
}

/**
 * Columns for the `rate` and `hsn` arms.
 *
 * **There are deliberately NO tax columns here, and that is a contract rather
 * than a gap.** This module must not call `@dealerlink/tax` — see the header
 * comment; a per-rate tax amount is not a stored column at any grain (F.99), so
 * producing one would mean recomputing, which is exactly what this report may not
 * do. The report shows what was BILLED, which is what a GSTR-1 base must do.
 * Rate-wise tax amounts come from `computeTaxSummary` in `@dealerlink/tax`, which
 * is what F.11 consumes.
 *
 * **`line_value` is PRE-DISCOUNT, and the label says so.** It sums
 * `order_lines.line_total`, which is `quantity × unit_price` before any
 * document-level discount (`apps/web/lib/actions/pi/helpers.ts:223`). A
 * post-discount figure per rate would require allocating the document discount
 * across lines, which only the engine does. Two of 44 seeded orders carry a
 * discount, so the two figures coincide on 42 of them — which is exactly why the
 * column must be named honestly rather than left to be assumed equal.
 */
const RATE_COLUMNS: ReportColumn[] = [
  { key: 'bucket', label: 'GST rate', type: 'text' },
  { key: 'supplyType', label: 'Supply type', type: 'text' },
  { key: 'orders', label: 'Orders', type: 'integer' },
  { key: 'lineValue', label: 'Line value (pre-discount)', type: 'money' },
];

const HSN_COLUMNS: ReportColumn[] = [
  { key: 'bucket', label: 'HSN/SAC', type: 'text' },
  ...RATE_COLUMNS.slice(1),
];

const COLUMNS: ReportColumn[] = [
  { key: 'state', label: 'Place of supply', type: 'text' },
  { key: 'supplyType', label: 'Supply type', type: 'text' },
  { key: 'orders', label: 'Orders', type: 'integer' },
  { key: 'taxable', label: 'Taxable amount', type: 'money' },
  { key: 'cgst', label: 'CGST', type: 'money' },
  { key: 'sgst', label: 'SGST', type: 'money' },
  { key: 'igst', label: 'IGST', type: 'money' },
];

export async function gstSummaryReport(
  tenantId: string,
  filters: GstSummaryFilters,
): Promise<ReportResult> {
  const { from, to } = filters;
  const statusList = sql.join(
    GST_SUPPLY_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  );
  const supplyClause =
    filters.supplyType === 'intra'
      ? sql`AND o.tenant_state_at_issue = o.place_of_supply`
      : filters.supplyType === 'inter'
        ? sql`AND o.tenant_state_at_issue <> o.place_of_supply`
        : sql``;

  const groupBy = filters.groupBy ?? 'state';
  if (groupBy !== 'state') {
    // Joins order_lines, which the state arm never does — gst_rate and hsn_code
    // are not otherwise in this query's scope at all.
    const bucketExpr = groupBy === 'rate' ? sql`ol.gst_rate::text` : sql`ol.hsn_code`;
    const rateRows = await withTenant(tenantId, async (tx) => {
      const res = await tx.execute<RateRow>(sql`
        SELECT ${bucketExpr} AS bucket,
               (o.tenant_state_at_issue <> o.place_of_supply) AS is_inter,
               count(DISTINCT o.id)::text AS order_count,
               coalesce(sum(ol.line_total), 0)::text AS line_value
        FROM orders o
        JOIN order_lines ol ON ol.order_id = o.id
        WHERE o.status IN (${statusList})
          AND o.order_date BETWEEN ${from} AND ${to}
          ${supplyClause}
        GROUP BY bucket, is_inter
        ORDER BY bucket, is_inter
      `);
      return res as unknown as RateRow[];
    });

    const rateDataRows: ReportRow[] = rateRows.map((r) => ({
      bucket: groupBy === 'rate' ? `${Number(r.bucket)}%` : r.bucket,
      supplyType: r.is_inter ? 'Inter-state' : 'Intra-state',
      orders: Number(r.order_count),
      lineValue: Number(r.line_value),
    }));

    const rateSum = (k: keyof ReportRow) =>
      rateDataRows.reduce((acc, r) => acc + Number(r[k] ?? 0), 0);

    return {
      columns: groupBy === 'rate' ? RATE_COLUMNS : HSN_COLUMNS,
      rows: rateDataRows,
      totals: {
        bucket: 'Total',
        supplyType: null,
        // NOT rateSum('orders'): an order appears under every rate it carries, so
        // summing the per-bucket counts double-counts a multi-rate order. There is
        // no correct single number here without a second query, so the cell is
        // left null rather than filled with a wrong one.
        orders: null,
        lineValue: rateSum('lineValue'),
      },
      metadata: {
        reportKey: 'gst-summary',
        reportName: groupBy === 'rate' ? 'GST Summary by rate' : 'GST Summary by HSN',
        generatedAt: new Date().toISOString(),
        filterLabel: `${from} to ${to}${
          filters.supplyType ? ` · ${filters.supplyType}-state only` : ''
        } · grouped by ${groupBy} · line value is pre-discount`,
        rowCount: rateDataRows.length,
      },
    };
  }

  const rows = await withTenant(tenantId, async (tx) => {
    const res = await tx.execute<GstRow>(sql`
      SELECT o.place_of_supply,
             (o.tenant_state_at_issue <> o.place_of_supply) AS is_inter,
             count(*)::text AS order_count,
             coalesce(sum(o.taxable_amount), 0)::text AS taxable,
             coalesce(sum(o.cgst_amount), 0)::text AS cgst,
             coalesce(sum(o.sgst_amount), 0)::text AS sgst,
             coalesce(sum(o.igst_amount), 0)::text AS igst
      FROM orders o
      WHERE o.status IN (${statusList})
        AND o.order_date BETWEEN ${from} AND ${to}
        ${supplyClause}
      GROUP BY o.place_of_supply, is_inter
      ORDER BY o.place_of_supply
    `);
    return res as unknown as GstRow[];
  });

  const dataRows: ReportRow[] = rows.map((r) => ({
    // place_of_supply is stored as an ISO 3166-2:IN code; show the full name.
    state: formatStateLabel(r.place_of_supply),
    supplyType: r.is_inter ? 'Inter-state' : 'Intra-state',
    orders: Number(r.order_count),
    taxable: Number(r.taxable),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    igst: Number(r.igst),
  }));

  const sum = (k: keyof ReportRow) => dataRows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const totals: ReportRow = {
    state: 'Total',
    supplyType: null,
    orders: sum('orders'),
    taxable: sum('taxable'),
    cgst: sum('cgst'),
    sgst: sum('sgst'),
    igst: sum('igst'),
  };

  return {
    columns: COLUMNS,
    rows: dataRows,
    totals,
    metadata: {
      reportKey: 'gst-summary',
      reportName: 'GST Summary',
      generatedAt: new Date().toISOString(),
      filterLabel: `${from} to ${to}${
        filters.supplyType ? ` · ${filters.supplyType}-state only` : ''
      }`,
      rowCount: dataRows.length,
    },
  };
}
