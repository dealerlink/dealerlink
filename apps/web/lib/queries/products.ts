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
