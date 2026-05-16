import { eq, sql } from 'drizzle-orm';

import { transitionInventoryItem } from '../inventory/transitions';
import { orderLines } from '../schema/order';
import type { DrizzleTx } from '../with-tenant';

/**
 * Inventory reservation for order confirmation (Day 11, docs/WORKFLOWS.md).
 *
 * Reservation is FIFO by procurement date, locks the picked serials with
 * `SELECT ... FOR UPDATE`, and is all-or-nothing: if any line cannot be fully
 * satisfied the caller's transaction is rolled back via
 * `InsufficientInventoryError`. Two orders racing for the same serials
 * serialise on the row lock — the loser re-reads the now-`reserved` rows,
 * finds them excluded by the `status = 'in_stock'` filter, and fails cleanly.
 */

export interface InventoryShortage {
  productId: string;
  productSku: string;
  productName: string;
  /** Units the order line needs. */
  requested: number;
  /** Units actually available in `in_stock`. */
  available: number;
  /** requested − available. */
  short: number;
}

export class InsufficientInventoryError extends Error {
  readonly code = 'INSUFFICIENT_INVENTORY' as const;
  constructor(readonly shortages: InventoryShortage[]) {
    super(
      'Insufficient inventory to confirm this order: ' +
        shortages
          .map((s) => `${s.productName} (${s.productSku}) — short ${s.short} of ${s.requested}`)
          .join('; '),
    );
    this.name = 'InsufficientInventoryError';
  }
}

export interface ReserveLineResult {
  orderLineId: string;
  productId: string;
  reserved: number;
}

export interface ReserveResult {
  reservedItemIds: string[];
  perLine: ReserveLineResult[];
}

/**
 * Reserve serialised inventory for every line of an order. Caller must
 * already be inside `withTenant(tenantId, ...)` and should have row-locked
 * the order itself.
 *
 * @throws {InsufficientInventoryError} if any line is short — listing every
 *   short product so the UI can show the full picture.
 */
export async function reserveInventoryForOrder(
  tx: DrizzleTx,
  orderId: string,
  opts: { dealerId: string; userId: string },
): Promise<ReserveResult> {
  const lines = await tx
    .select({
      id: orderLines.id,
      productId: orderLines.productId,
      productSku: orderLines.productSku,
      productName: orderLines.productName,
      quantity: orderLines.quantity,
    })
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId));

  const shortages: InventoryShortage[] = [];
  const reservedItemIds: string[] = [];
  const perLine: ReserveLineResult[] = [];

  for (const line of lines) {
    const requested = Math.round(Number(line.quantity));
    if (requested <= 0) {
      perLine.push({ orderLineId: line.id, productId: line.productId, reserved: 0 });
      continue;
    }
    // FIFO lock: oldest procurement first. FOR UPDATE serialises competing
    // confirmations on the very rows we intend to reserve — a racing
    // confirmation blocks here, then re-reads the now-`reserved` rows and
    // finds them excluded by the `status = 'in_stock'` filter.
    const locked = await tx.execute<{ id: string }>(sql`
      SELECT id FROM inventory_items
      WHERE product_id = ${line.productId}
        AND status = 'in_stock'
      ORDER BY procurement_date ASC NULLS LAST, created_at ASC
      LIMIT ${requested}
      FOR UPDATE
    `);
    const itemIds = (locked as unknown as { id: string }[]).map((r) => r.id);

    if (itemIds.length < requested) {
      shortages.push({
        productId: line.productId,
        productSku: line.productSku,
        productName: line.productName,
        requested,
        available: itemIds.length,
        short: requested - itemIds.length,
      });
      // Do not reserve a short line — but keep scanning so the thrown error
      // lists every short product, not just the first.
      continue;
    }

    // Full line — reserve immediately. Transitioning now means a later line
    // for the same product cannot double-count these serials.
    for (const itemId of itemIds) {
      await transitionInventoryItem(tx, itemId, 'reserved', {
        reservedForOrderId: orderId,
        reservedForDealerId: opts.dealerId,
        updatedBy: opts.userId,
      });
      reservedItemIds.push(itemId);
    }
    await tx
      .update(orderLines)
      .set({ reservedQuantity: itemIds.length.toFixed(3) })
      .where(eq(orderLines.id, line.id));
    perLine.push({ orderLineId: line.id, productId: line.productId, reserved: itemIds.length });
  }

  if (shortages.length > 0) {
    // Throwing rolls back the whole transaction — including any lines already
    // reserved above. No partial reservation ever survives.
    throw new InsufficientInventoryError(shortages);
  }

  return { reservedItemIds, perLine };
}

/**
 * Release every serial currently reserved for an order back to `in_stock`
 * (order cancellation). Resets `order_lines.reserved_quantity` to zero.
 * Returns the number of serials released.
 */
export async function releaseInventoryForOrder(
  tx: DrizzleTx,
  orderId: string,
  userId: string,
): Promise<number> {
  const locked = await tx.execute<{ id: string }>(sql`
    SELECT id FROM inventory_items
    WHERE reserved_for_order_id = ${orderId} AND status = 'reserved'
    FOR UPDATE
  `);
  const ids = (locked as unknown as { id: string }[]).map((r) => r.id);
  for (const id of ids) {
    await transitionInventoryItem(tx, id, 'in_stock', { updatedBy: userId });
  }
  await tx.update(orderLines).set({ reservedQuantity: '0' }).where(eq(orderLines.orderId, orderId));
  return ids.length;
}
