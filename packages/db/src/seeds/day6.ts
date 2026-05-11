/**
 * Day 6 seed extension: procurements + ~500 inventory items per tenant.
 *
 * Run AFTER day5.ts (which creates dealers + products). Re-runnable: it
 * truncates procurements/procurement_items/inventory_items first.
 *
 * Mix per CLAUDE.md §13:
 *   - ~60% in_stock
 *   - ~30% reserved (linked to a random dealer; orderId stays NULL since
 *     orders don't exist yet)
 *   - ~10% other (dispatched / delivered / damaged)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import {
  dealers,
  inventoryItems,
  procurementItems,
  procurements,
  products,
  tenants,
  users,
} from '../schema';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const SERIAL_PREFIX_BY_MANUFACTURER: Record<string, string> = {
  'Premier Energies': 'PRE',
  'Adani Solar': 'ADL',
  'Vikram Solar': 'VIK',
};

function makeSerial(manufacturer: string, idx: number): string {
  const prefix = SERIAL_PREFIX_BY_MANUFACTURER[manufacturer] ?? 'SN';
  return `${prefix}-${String(idx).padStart(7, '0')}`;
}

interface ProductRow {
  id: string;
  manufacturer: string | null;
  defaultPurchasePrice: string | null;
}

interface DealerRow {
  id: string;
}

async function seedTenant(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  adminId: string | null,
  fiscalYear: number,
) {
  const prods = (await db
    .select({
      id: products.id,
      manufacturer: products.manufacturer,
      defaultPurchasePrice: products.defaultPurchasePrice,
    })
    .from(products)) as ProductRow[];
  const deals = (await db.select({ id: dealers.id }).from(dealers)) as DealerRow[];

  if (prods.length === 0) {
    console.log('  · (no products — skipping)');
    return;
  }

  // Create 5 procurements spanning the last 6 months
  const procIds: string[] = [];
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${adminId ?? ''}, true)`);

    for (let i = 0; i < 5; i++) {
      const result = await tx.execute<{ last_value: string | number }>(sql`
        INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
        VALUES (${tenantId}, 'procurement', ${fiscalYear}, 1)
        ON CONFLICT (tenant_id, doc_type, fiscal_year)
        DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
        RETURNING last_value
      `);
      const seq = Number((result as unknown as { last_value: string | number }[])[0]!.last_value);
      const num = `PROC-${fiscalYear}-${String(seq).padStart(4, '0')}`;
      const dt = new Date();
      dt.setDate(dt.getDate() - i * 30);
      const dateStr = dt.toISOString().slice(0, 10);

      const manufacturers = ['Premier Energies', 'Adani Solar', 'Vikram Solar'];
      const supplier = manufacturers[i % manufacturers.length]!;

      const [proc] = await tx
        .insert(procurements)
        .values({
          tenantId,
          procurementNumber: num,
          procurementDate: dateStr,
          supplierName: supplier,
          invoiceNumber: `INV-${supplier.slice(0, 3).toUpperCase()}-${1000 + i}`,
          invoiceDate: dateStr,
          totalAmount: '0',
          status: 'received',
          confirmedAt: new Date(dt.getTime() + 86400000),
          receivedAt: new Date(dt.getTime() + 172800000),
          createdBy: adminId,
          updatedBy: adminId,
        })
        .returning();
      procIds.push(proc!.id);
    }
  });

  // ~500 inventory items distributed across products, mapped to procurements
  const totalItems = 500;
  let serialIdx = (Math.abs(tenantId.charCodeAt(0)) * 100000) % 9000000;
  const statusMix: Array<'in_stock' | 'reserved' | 'dispatched' | 'delivered' | 'damaged'> = [];
  for (let i = 0; i < totalItems; i++) {
    if (i < totalItems * 0.6) statusMix.push('in_stock');
    else if (i < totalItems * 0.9) statusMix.push('reserved');
    else if (i < totalItems * 0.93) statusMix.push('dispatched');
    else if (i < totalItems * 0.98) statusMix.push('delivered');
    else statusMix.push('damaged');
  }
  // Shuffle deterministically
  for (let i = statusMix.length - 1; i > 0; i--) {
    const j = (i * 31 + 7) % (i + 1);
    [statusMix[i], statusMix[j]] = [statusMix[j]!, statusMix[i]!];
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${adminId ?? ''}, true)`);

    // Per procurement, choose 3-5 products and create line items.
    const linesByProc: Record<string, Map<string, number>> = {};
    for (const pid of procIds) linesByProc[pid] = new Map();

    const itemsBatch: (typeof inventoryItems.$inferInsert)[] = [];
    for (let i = 0; i < totalItems; i++) {
      serialIdx++;
      const prod = prods[i % prods.length]!;
      const procId = procIds[i % procIds.length]!;
      const status = statusMix[i]!;
      const reservedDealer =
        status === 'reserved' && deals.length > 0 ? deals[i % deals.length]!.id : null;
      const procDate = new Date();
      procDate.setDate(procDate.getDate() - (i % 180));

      const purchasePrice = prod.defaultPurchasePrice ?? '0';
      linesByProc[procId]!.set(prod.id, (linesByProc[procId]!.get(prod.id) ?? 0) + 1);

      itemsBatch.push({
        tenantId,
        productId: prod.id,
        serialNumber: makeSerial(prod.manufacturer ?? 'Other', serialIdx),
        status,
        warehouseCode: 'WH-MAIN',
        procurementId: procId,
        procurementDate: procDate.toISOString().slice(0, 10),
        purchasePrice,
        reservedForDealerId: reservedDealer,
        reservedAt: status === 'reserved' ? new Date() : null,
        dispatchedAt: status === 'dispatched' || status === 'delivered' ? new Date() : null,
        deliveredAt: status === 'delivered' ? new Date() : null,
        deliveredTo: status === 'delivered' ? 'Demo Site' : null,
        createdBy: adminId,
        updatedBy: adminId,
      });
    }

    // Bulk insert in chunks of 100
    for (let i = 0; i < itemsBatch.length; i += 100) {
      await tx.insert(inventoryItems).values(itemsBatch.slice(i, i + 100));
    }

    // Create procurement_items rows + update totals
    for (const [procId, counts] of Object.entries(linesByProc)) {
      let procTotal = 0;
      for (const [productId, qty] of counts.entries()) {
        const prod = prods.find((p) => p.id === productId)!;
        const unit = Number(prod.defaultPurchasePrice ?? '0');
        const lineTotal = unit * qty;
        procTotal += lineTotal;
        await tx.insert(procurementItems).values({
          tenantId,
          procurementId: procId,
          productId,
          quantity: qty,
          unitPrice: unit.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
          serialsReceived: qty,
        });
      }
      await tx.execute(
        sql`UPDATE procurements SET total_amount = ${procTotal.toFixed(2)} WHERE id = ${procId}`,
      );
    }
  });

  console.log(`  · 5 procurements + ${totalItems} inventory items`);
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Day 6 seed: procurements + inventory items');

  await client.unsafe(`
    TRUNCATE TABLE
      inventory_items,
      procurement_items,
      procurements
    RESTART IDENTITY CASCADE;
  `);

  // Reset the procurement counter so re-runs don't drift.
  await client.unsafe(`DELETE FROM document_counters WHERE doc_type = 'procurement';`);

  const fiscalYear = 2026;
  const tenantRows = await db.select().from(tenants);
  for (const t of tenantRows) {
    if (t.status !== 'active') continue;
    console.log(`  · Tenant ${t.slug}`);
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'admin'`)
      .limit(1);
    await seedTenant(db, t.id, admin?.id ?? null, fiscalYear);
  }

  await client.end({ timeout: 5 });
  console.log('✓ Day 6 seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Day 6 seed failed:', err);
  process.exit(1);
});
