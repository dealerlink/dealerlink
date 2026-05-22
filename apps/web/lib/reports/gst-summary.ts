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

export interface GstSummaryFilters {
  from: string;
  to: string;
  /** Restrict to a supply type. */
  supplyType?: 'intra' | 'inter' | undefined;
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
