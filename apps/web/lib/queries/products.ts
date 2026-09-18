import { inventoryItems, products, withTenant } from '@dealerlink/db';
import { type ProductListFilter, productListFilterSchema } from '@dealerlink/schemas';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';

export interface ProductListRow {
  id: string;
  sku: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  category: string | null;
  subcategory: string | null;
  hsnCode: string;
  gstRate: string;
  mrp: string | null;
  defaultSellingPrice: string | null;
  requiresSerial: boolean;
  status: 'active' | 'inactive' | 'discontinued';
  updatedAt: Date;
}

export interface ProductListResult {
  rows: ProductListRow[];
  total: number;
  limit: number;
  offset: number;
}

export async function listProducts(
  tenantId: string,
  raw: Partial<ProductListFilter>,
): Promise<ProductListResult> {
  const filter = productListFilterSchema.parse(raw);
  return withTenant(tenantId, async (tx) => {
    const where = [eq(products.tenantId, tenantId)];
    if (filter.status) where.push(eq(products.status, filter.status));
    if (filter.category) where.push(eq(products.category, filter.category));
    if (filter.subcategory) where.push(eq(products.subcategory, filter.subcategory));
    if (filter.manufacturer) where.push(eq(products.manufacturer, filter.manufacturer));
    if (filter.search && filter.search.trim().length > 0) {
      const q = `%${filter.search.trim()}%`;
      const clause = or(
        ilike(products.name, q),
        ilike(products.sku, q),
        ilike(products.manufacturer, q),
        ilike(products.model, q),
        ilike(products.subcategory, q),
      );
      if (clause) where.push(clause);
    }

    const whereClause = and(...where);
    const rows = await tx
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        manufacturer: products.manufacturer,
        model: products.model,
        category: products.category,
        subcategory: products.subcategory,
        hsnCode: products.hsnCode,
        gstRate: products.gstRate,
        mrp: products.mrp,
        defaultSellingPrice: products.defaultSellingPrice,
        requiresSerial: products.requiresSerial,
        status: products.status,
        updatedAt: products.updatedAt,
      })
      .from(products)
      .where(whereClause)
      .orderBy(desc(products.updatedAt))
      .limit(filter.limit)
      .offset(filter.offset);

    const [totalRow] = await tx.select({ value: count() }).from(products).where(whereClause);

    return {
      rows: rows as ProductListRow[],
      total: totalRow?.value ?? 0,
      limit: filter.limit,
      offset: filter.offset,
    };
  });
}

export async function getProductById(tenantId: string, id: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(products).where(eq(products.id, id)).limit(1);
    if (!row) return null;

    // Inventory summary (best-effort — Day 5 ships the data model; Day 6 fills it).
    const summary = await tx
      .select({
        status: inventoryItems.status,
        value: count(),
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.productId, id)))
      .groupBy(inventoryItems.status);

    return { product: row, inventorySummary: summary };
  });
}

export async function searchProducts(tenantId: string, query: string, limit = 10) {
  const q = `%${query.trim()}%`;
  return withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        manufacturer: products.manufacturer,
        mrp: products.mrp,
        gstRate: products.gstRate,
      })
      .from(products)
      .where(
        and(
          eq(products.tenantId, tenantId),
          eq(products.status, 'active'),
          or(ilike(products.name, q), ilike(products.sku, q), ilike(products.manufacturer, q))!,
        ),
      )
      .limit(limit);
  });
}

/**
 * The distinct GST rates already present in this tenant's own catalogue.
 *
 * Feeds the catalogue form's rate SUGGESTIONS (F.55, `docs/F55_SPEC.md` §3).
 * Suggestions are a convenience and never a constraint — any shape-valid rate
 * may be typed. Nothing is hardcoded, so nothing goes stale, and the list is
 * correct per tenant by construction.
 *
 * ── TENANT SCOPING IS THE WHOLE POINT OF THIS FUNCTION'S SHAPE ──────────────
 *
 * A suggestion list that leaked another tenant's rates would be a quiet
 * cross-tenant read: nothing would error, the UI would simply offer rates the
 * tenant never set, and the leak would be invisible in any test that only
 * checks the list is non-empty. So this goes through the SAME path as every
 * other query in this module and takes both belts:
 *
 *   1. `withTenant(tenantId, …)` sets `app.tenant_id` inside the transaction,
 *      which is what the RLS policy on `products` reads (CLAUDE.md §4). Rows
 *      belonging to other tenants are not visible to this statement at all.
 *   2. An explicit `eq(products.tenantId, tenantId)` in the WHERE clause, as
 *      `listProducts` and `searchProducts` both do. Redundant while RLS holds,
 *      and the point is that it stops being redundant the moment RLS does not.
 *
 * It is deliberately NOT a raw `SELECT DISTINCT gst_rate FROM products`.
 *
 * ── The string/number boundary ─────────────────────────────────────────────
 *
 * `gst_rate` is `decimal(5,2)`, so the driver returns `'5.00'` / `'18.00'`
 * (CLAUDE.md §5, DEV.135). Comparing those against a typed or hand-written
 * literal is the live hazard that section names — `['5','18'].includes('18.00')`
 * is `false`. This function is the single boundary: it returns NUMBERS, so no
 * caller has to remember to coerce, and the deduplication happens after
 * coercion rather than over driver strings (`'5.0'` and `'5.00'` would dedupe as
 * two distinct strings but one number).
 */
export async function listTenantGstRates(tenantId: string): Promise<number[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .selectDistinct({ gstRate: products.gstRate })
      .from(products)
      .where(eq(products.tenantId, tenantId));

    const seen = new Set<number>();
    for (const r of rows) {
      const n = Number(r.gstRate);
      if (Number.isFinite(n)) seen.add(n);
    }
    return [...seen].sort((a, b) => a - b);
  });
}
