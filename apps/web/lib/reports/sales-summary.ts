/**
 * REPORT 1 — Sales Summary.
 *
 * Rolls up the three commercial documents — quotations (sent/accepted),
 * proforma invoices (confirmed) and orders (all statuses) — into one stream
 * and groups it by month, dealer or product.
 *
 * Every money column is READ from the document's stored totals
 * (`subtotal`, `discount_amount`, `cgst/sgst/igst_amount`, `total_amount`).
 * Nothing here recomputes tax — CLAUDE.md §6.
 */
import { withTenant } from '@dealerlink/db';
import { sql } from 'drizzle-orm';

import type { ReportColumn, ReportResult, ReportRow } from './types';

export type SalesGroupBy = 'month' | 'dealer' | 'product';

export interface SalesSummaryFilters {
  from: string;
  to: string;
  groupBy: SalesGroupBy;
  /** Restrict to one document status (statuses differ per doc type). */
  status?: string | undefined;
  dealerId?: string | undefined;
  preparedBy?: string | undefined;
}

interface AggRow extends Record<string, unknown> {
  group_key: string;
  group_label: string;
  doc_count: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
}

const COLUMNS_BY_GROUP: Record<SalesGroupBy, string> = {
  month: 'Month',
  dealer: 'Dealer',
  product: 'Product',
};

function columns(groupBy: SalesGroupBy): ReportColumn[] {
  return [
    { key: 'group', label: COLUMNS_BY_GROUP[groupBy], type: 'text' },
    { key: 'count', label: 'Documents', type: 'integer' },
    { key: 'subtotal', label: 'Subtotal', type: 'money' },
    { key: 'discount', label: 'Discount', type: 'money' },
    { key: 'tax', label: 'Tax (CGST+SGST+IGST)', type: 'money' },
    { key: 'total', label: 'Total', type: 'money' },
    { key: 'avg', label: 'Avg deal size', type: 'money' },
  ];
}

export async function salesSummaryReport(
  tenantId: string,
  filters: SalesSummaryFilters,
): Promise<ReportResult> {
  const { from, to, groupBy } = filters;
  const statusClause = filters.status ? sql`AND d.status = ${filters.status}` : sql``;
  const dealerClause = filters.dealerId ? sql`AND d.dealer_id = ${filters.dealerId}` : sql``;
  const preparedClause = filters.preparedBy
    ? sql`AND d.prepared_by = ${filters.preparedBy}`
    : sql``;

  const rows = await withTenant(tenantId, async (tx) => {
    if (groupBy === 'product') {
      // Product grouping needs the line tables. Each line carries the parent
      // document's date/status/dealer for filtering.
      const res = await tx.execute<AggRow>(sql`
        WITH lines AS (
          SELECT ql.product_id, ql.product_name AS group_label,
                 q.quote_date AS doc_date, q.status::text, q.dealer_id, q.prepared_by,
                 ql.line_total, q.id AS doc_id
          FROM quotation_lines ql
          JOIN quotations q ON q.id = ql.quotation_id
          WHERE q.status IN ('sent', 'accepted')
          UNION ALL
          SELECT pil.product_id, pil.product_name,
                 pi.pi_date, pi.status::text, pi.bill_to_dealer_id, pi.prepared_by,
                 pil.line_total, pi.id
          FROM performa_invoice_lines pil
          JOIN performa_invoices pi ON pi.id = pil.performa_invoice_id
          WHERE pi.status = 'confirmed'
          UNION ALL
          SELECT ol.product_id, ol.product_name,
                 o.order_date, o.status::text, o.bill_to_dealer_id, o.created_by,
                 ol.line_total, o.id
          FROM order_lines ol
          JOIN orders o ON o.id = ol.order_id
        ),
        d AS (SELECT * FROM lines)
        SELECT d.product_id::text AS group_key,
               max(d.group_label) AS group_label,
               count(DISTINCT d.doc_id)::text AS doc_count,
               coalesce(sum(d.line_total), 0)::text AS subtotal,
               '0' AS discount,
               '0' AS tax,
               coalesce(sum(d.line_total), 0)::text AS total
        FROM d
        WHERE d.doc_date BETWEEN ${from} AND ${to}
          ${statusClause} ${dealerClause} ${preparedClause}
        GROUP BY d.product_id
        ORDER BY sum(d.line_total) DESC
      `);
      return res as unknown as AggRow[];
    }

    const groupSelect =
      groupBy === 'month'
        ? sql`to_char(d.doc_date, 'YYYY-MM') AS group_key, to_char(d.doc_date, 'Mon YYYY') AS group_label`
        : sql`d.dealer_id::text AS group_key, coalesce(max(dl.display_name), '—') AS group_label`;
    const groupBySql =
      groupBy === 'month'
        ? sql`to_char(d.doc_date, 'YYYY-MM'), to_char(d.doc_date, 'Mon YYYY')`
        : sql`d.dealer_id`;
    const dealerJoin =
      groupBy === 'dealer' ? sql`LEFT JOIN dealers dl ON dl.id = d.dealer_id` : sql``;

    const res = await tx.execute<AggRow>(sql`
      WITH docs AS (
        SELECT 'quotation' AS doc_type, q.quote_date AS doc_date, q.status::text,
               q.dealer_id, q.prepared_by, q.subtotal, q.discount_amount,
               (q.cgst_amount + q.sgst_amount + q.igst_amount) AS tax, q.total_amount
        FROM quotations q WHERE q.status IN ('sent', 'accepted')
        UNION ALL
        SELECT 'pi', pi.pi_date, pi.status::text, pi.bill_to_dealer_id, pi.prepared_by,
               pi.subtotal, pi.discount_amount,
               (pi.cgst_amount + pi.sgst_amount + pi.igst_amount), pi.total_amount
        FROM performa_invoices pi WHERE pi.status = 'confirmed'
        UNION ALL
        SELECT 'order', o.order_date, o.status::text, o.bill_to_dealer_id, o.created_by,
               o.subtotal, o.discount_amount,
               (o.cgst_amount + o.sgst_amount + o.igst_amount), o.total_amount
        FROM orders o
      ),
      d AS (SELECT * FROM docs)
      SELECT ${groupSelect},
             count(*)::text AS doc_count,
             coalesce(sum(d.subtotal), 0)::text AS subtotal,
             coalesce(sum(d.discount_amount), 0)::text AS discount,
             coalesce(sum(d.tax), 0)::text AS tax,
             coalesce(sum(d.total_amount), 0)::text AS total
      FROM d ${dealerJoin}
      WHERE d.doc_date BETWEEN ${from} AND ${to}
        ${statusClause} ${dealerClause} ${preparedClause}
      GROUP BY ${groupBySql}
      ORDER BY ${groupBy === 'month' ? sql`group_key` : sql`sum(d.total_amount) DESC`}
    `);
    return res as unknown as AggRow[];
  });

  const dataRows: ReportRow[] = rows.map((r) => {
    const count = Number(r.doc_count);
    const total = Number(r.total);
    return {
      group: r.group_label,
      count,
      subtotal: Number(r.subtotal),
      discount: Number(r.discount),
      tax: Number(r.tax),
      total,
      avg: count > 0 ? total / count : 0,
    };
  });

  const sum = (k: keyof ReportRow) => dataRows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const totalCount = sum('count');
  const totalTotal = sum('total');
  const totals: ReportRow = {
    group: 'Total',
    count: totalCount,
    subtotal: sum('subtotal'),
    discount: sum('discount'),
    tax: sum('tax'),
    total: totalTotal,
    avg: totalCount > 0 ? totalTotal / totalCount : 0,
  };

  return {
    columns: columns(groupBy),
    rows: dataRows,
    totals,
    metadata: {
      reportKey: 'sales-summary',
      reportName: 'Sales Summary',
      generatedAt: new Date().toISOString(),
      filterLabel: `${from} to ${to} · grouped by ${groupBy}${
        filters.status ? ` · status ${filters.status}` : ''
      }`,
      rowCount: dataRows.length,
    },
  };
}
