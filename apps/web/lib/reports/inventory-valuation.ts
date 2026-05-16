/**
 * REPORT 3 — Inventory Valuation.
 *
 * In-stock serialised inventory valued at the *last procurement cost* per
 * product (qty × unit cost). FIFO would be more correct but is Phase 2 — the
 * note is intentional and recorded in DEVIATIONS.
 *
 * The cost basis falls back to `products.default_purchase_price` when a
 * product has no procurement history.
 */
import { withTenant } from '@dealerlink/db';
import { sql } from 'drizzle-orm';

import type { ReportColumn, ReportResult, ReportRow } from './types';

export interface InventoryValuationFilters {
  /** Restrict to one product category. */
  category?: string | undefined;
  /** Show only products whose in-stock qty is below the low-stock threshold. */
  lowStockOnly?: boolean | undefined;
}

interface ValRow extends Record<string, unknown> {
  sku: string;
  name: string;
  category: string | null;
  qty: string;
  unit_cost: string;
  valuation: string;
}

const COLUMNS: ReportColumn[] = [
  { key: 'sku', label: 'SKU', type: 'text' },
  { key: 'name', label: 'Product', type: 'text' },
  { key: 'category', label: 'Category', type: 'text' },
  { key: 'qty', label: 'In stock', type: 'integer' },
  { key: 'unitCost', label: 'Last cost', type: 'money' },
  { key: 'valuation', label: 'Valuation', type: 'money' },
];

export async function inventoryValuationReport(
  tenantId: string,
  filters: InventoryValuationFilters,
): Promise<ReportResult> {
  const categoryClause = filters.category ? sql`AND p.category = ${filters.category}` : sql``;
  const lowStockClause = filters.lowStockOnly
    ? sql`AND s.qty < coalesce((SELECT low_stock_threshold FROM tenant_settings LIMIT 1), 50)`
    : sql``;

  const rows = await withTenant(tenantId, async (tx) => {
    const res = await tx.execute<ValRow>(sql`
      WITH stock AS (
        SELECT product_id, count(*)::int AS qty
        FROM inventory_items
        WHERE status = 'in_stock'
        GROUP BY product_id
      ),
      last_cost AS (
        SELECT DISTINCT ON (pit.product_id) pit.product_id, pit.unit_price
        FROM procurement_items pit
        JOIN procurements pr ON pr.id = pit.procurement_id
        ORDER BY pit.product_id, pr.procurement_date DESC, pr.created_at DESC
      )
      SELECT p.sku, p.name, p.category,
             s.qty::text AS qty,
             coalesce(lc.unit_price, p.default_purchase_price, 0)::text AS unit_cost,
             (s.qty * coalesce(lc.unit_price, p.default_purchase_price, 0))::text AS valuation
      FROM products p
      JOIN stock s ON s.product_id = p.id
      LEFT JOIN last_cost lc ON lc.product_id = p.id
      WHERE p.deleted_at IS NULL
        ${categoryClause} ${lowStockClause}
      ORDER BY (s.qty * coalesce(lc.unit_price, p.default_purchase_price, 0)) DESC
    `);
    return res as unknown as ValRow[];
  });

  const dataRows: ReportRow[] = rows.map((r) => ({
    sku: r.sku,
    name: r.name,
    category: r.category,
    qty: Number(r.qty),
    unitCost: Number(r.unit_cost),
    valuation: Number(r.valuation),
  }));

  const totals: ReportRow = {
    sku: 'Total',
    name: null,
    category: null,
    qty: dataRows.reduce((s, r) => s + Number(r.qty), 0),
    unitCost: null,
    valuation: dataRows.reduce((s, r) => s + Number(r.valuation), 0),
  };

  return {
    columns: COLUMNS,
    rows: dataRows,
    totals,
    metadata: {
      reportKey: 'inventory-valuation',
      reportName: 'Inventory Valuation',
      generatedAt: new Date().toISOString(),
      filterLabel: `In-stock at last procurement cost${
        filters.category ? ` · category ${filters.category}` : ''
      }${filters.lowStockOnly ? ' · low stock only' : ''}`,
      rowCount: dataRows.length,
    },
  };
}
