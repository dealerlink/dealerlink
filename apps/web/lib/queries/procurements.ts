import {
  inventoryItems,
  procurementItems,
  procurements,
  products,
  withTenant,
} from '@dealerlink/db';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

export interface ProcurementListRow {
  id: string;
  procurementNumber: string;
  procurementDate: string;
  supplierName: string;
  totalAmount: string;
  status: 'draft' | 'confirmed' | 'received';
  itemsCount: number;
  updatedAt: Date;
}

export async function listProcurements(tenantId: string, limit = 100, offset = 0) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{
      id: string;
      procurement_number: string;
      procurement_date: string;
      supplier_name: string;
      total_amount: string;
      status: 'draft' | 'confirmed' | 'received';
      items_count: number;
      updated_at: Date;
    }>(sql`
      SELECT p.id,
             p.procurement_number,
             p.procurement_date,
             p.supplier_name,
             p.total_amount,
             p.status,
             p.updated_at,
             COUNT(pi.id)::int AS items_count
      FROM procurements p
      LEFT JOIN procurement_items pi ON pi.procurement_id = p.id
      GROUP BY p.id
      ORDER BY p.procurement_date DESC, p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const result: ProcurementListRow[] = (
      rows as unknown as {
        id: string;
        procurement_number: string;
        procurement_date: string;
        supplier_name: string;
        total_amount: string;
        status: 'draft' | 'confirmed' | 'received';
        items_count: number;
        updated_at: Date;
      }[]
    ).map((r) => ({
      id: r.id,
      procurementNumber: r.procurement_number,
      procurementDate: r.procurement_date,
      supplierName: r.supplier_name,
      totalAmount: r.total_amount,
      status: r.status,
      itemsCount: r.items_count,
      updatedAt: r.updated_at,
    }));

    const [{ value: total } = { value: 0 }] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(procurements);

    return { rows: result, total: total ?? 0 };
  });
}

export async function getProcurementDetail(tenantId: string, id: string) {
  return withTenant(tenantId, async (tx) => {
    const [header] = await tx.select().from(procurements).where(eq(procurements.id, id)).limit(1);
    if (!header) return null;

    const lines = await tx
      .select({
        id: procurementItems.id,
        productId: procurementItems.productId,
        productName: products.name,
        productSku: products.sku,
        productHsn: products.hsnCode,
        requiresSerial: products.requiresSerial,
        quantity: procurementItems.quantity,
        unitPrice: procurementItems.unitPrice,
        lineTotal: procurementItems.lineTotal,
        serialsReceived: procurementItems.serialsReceived,
      })
      .from(procurementItems)
      .innerJoin(products, eq(products.id, procurementItems.productId))
      .where(eq(procurementItems.procurementId, id))
      .orderBy(asc(products.name));

    return { header, lines };
  });
}

export interface InventoryListRow {
  id: string;
  serialNumber: string | null;
  productId: string;
  productName: string;
  productSku: string;
  manufacturer: string | null;
  status: 'in_stock' | 'reserved' | 'dispatched' | 'delivered' | 'returned' | 'damaged' | 'lost';
  warehouseCode: string | null;
  procurementId: string | null;
  procurementNumber: string | null;
  procurementDate: string | null;
  reservedForDealerId: string | null;
  reservedAt: Date | null;
}

export interface InventoryListResult {
  rows: InventoryListRow[];
  total: number;
}

export interface InventoryListOptions {
  search?: string;
  status?: InventoryListRow['status'];
  productId?: string;
  procurementId?: string;
  limit?: number;
  offset?: number;
}

export async function listInventory(
  tenantId: string,
  opts: InventoryListOptions = {},
): Promise<InventoryListResult> {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  return withTenant(tenantId, async (tx) => {
    const where = [eq(inventoryItems.tenantId, tenantId)];
    if (opts.status) where.push(eq(inventoryItems.status, opts.status));
    if (opts.productId) where.push(eq(inventoryItems.productId, opts.productId));
    if (opts.procurementId) where.push(eq(inventoryItems.procurementId, opts.procurementId));
    if (opts.search && opts.search.trim().length > 0) {
      const q = opts.search.trim();
      where.push(sql`${inventoryItems.serialNumber} ILIKE ${'%' + q + '%'}`);
    }
    const whereClause = and(...where);

    const rows = await tx
      .select({
        id: inventoryItems.id,
        serialNumber: inventoryItems.serialNumber,
        productId: inventoryItems.productId,
        productName: products.name,
        productSku: products.sku,
        manufacturer: products.manufacturer,
        status: inventoryItems.status,
        warehouseCode: inventoryItems.warehouseCode,
        procurementId: inventoryItems.procurementId,
        procurementNumber: procurements.procurementNumber,
        procurementDate: inventoryItems.procurementDate,
        reservedForDealerId: inventoryItems.reservedForDealerId,
        reservedAt: inventoryItems.reservedAt,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(products.id, inventoryItems.productId))
      .leftJoin(procurements, eq(procurements.id, inventoryItems.procurementId))
      .where(whereClause)
      .orderBy(desc(inventoryItems.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ value: total } = { value: 0 }] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(whereClause);

    return { rows: rows as InventoryListRow[], total: total ?? 0 };
  });
}

export async function getInventoryItemDetail(tenantId: string, id: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({
        item: inventoryItems,
        product: products,
        procurement: procurements,
      })
      .from(inventoryItems)
      .innerJoin(products, eq(products.id, inventoryItems.productId))
      .leftJoin(procurements, eq(procurements.id, inventoryItems.procurementId))
      .where(eq(inventoryItems.id, id))
      .limit(1);
    return row ?? null;
  });
}

export async function inventoryDashboardStats(tenantId: string) {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.execute<{ status: string; n: number }>(sql`
      SELECT status, count(*)::int AS n
      FROM inventory_items
      GROUP BY status
    `);
    const counts: Record<string, number> = {};
    for (const r of rows as unknown as { status: string; n: number }[]) {
      counts[r.status] = r.n;
    }

    const lowStock = await tx.execute<{
      product_id: string;
      name: string;
      sku: string;
      n: number;
    }>(sql`
      SELECT p.id AS product_id, p.name, p.sku, count(i.id)::int AS n
      FROM products p
      LEFT JOIN inventory_items i
        ON i.product_id = p.id AND i.status = 'in_stock'
      WHERE p.status = 'active'
      GROUP BY p.id, p.name, p.sku
      HAVING count(i.id) < 10
      ORDER BY n ASC
      LIMIT 5
    `);

    const recent = await tx.execute<{
      id: string;
      procurement_number: string;
      procurement_date: string;
      supplier_name: string;
      total_amount: string;
    }>(sql`
      SELECT id, procurement_number, procurement_date, supplier_name, total_amount
      FROM procurements
      ORDER BY procurement_date DESC, created_at DESC
      LIMIT 5
    `);

    return {
      counts,
      lowStock: lowStock as unknown as {
        product_id: string;
        name: string;
        sku: string;
        n: number;
      }[],
      recent: recent as unknown as {
        id: string;
        procurement_number: string;
        procurement_date: string;
        supplier_name: string;
        total_amount: string;
      }[],
    };
  });
}
