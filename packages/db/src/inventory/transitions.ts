import { sql, eq, and } from 'drizzle-orm';

import { inventoryItems, type InventoryItem } from '../schema/inventory';
import type { DrizzleTx } from '../with-tenant';

export type InventoryStatus =
  | 'in_stock'
  | 'reserved'
  | 'dispatched'
  | 'delivered'
  | 'returned'
  | 'damaged'
  | 'lost';

/**
 * Allowed status transitions for inventory_items. The state machine is
 * authoritative — no Server Action or query helper may UPDATE
 * inventory_items.status directly; every change goes through
 * transitionInventoryItem().
 */
export const ALLOWED_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  in_stock: ['reserved', 'damaged', 'lost'],
  reserved: ['in_stock', 'dispatched'],
  dispatched: ['delivered', 'returned'],
  delivered: [],
  returned: ['in_stock'],
  damaged: [],
  lost: [],
};

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor(
    readonly from: InventoryStatus,
    readonly to: InventoryStatus,
  ) {
    super(`Cannot transition inventory item from "${from}" to "${to}"`);
    this.name = 'InvalidTransitionError';
  }
}

export class InventoryItemNotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  constructor(readonly id: string) {
    super(`Inventory item ${id} not found`);
    this.name = 'InventoryItemNotFoundError';
  }
}

export function isAllowed(from: InventoryStatus, to: InventoryStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface TransitionPatch {
  warehouseCode?: string | null;
  bin?: string | null;
  reservedForOrderId?: string | null;
  reservedForDealerId?: string | null;
  reservedAt?: Date | null;
  dispatchId?: string | null;
  dispatchedAt?: Date | null;
  deliveredAt?: Date | null;
  deliveredTo?: string | null;
  notes?: string | null;
  updatedBy?: string | null;
}

/**
 * Move an inventory item to a new status, with a row lock so two callers
 * cannot reserve or dispatch the same serial concurrently.
 *
 * Caller must already be inside `withTenant(tenantId, ...)` — RLS plus the
 * `app.tenant_id` GUC ensure we cannot touch another tenant's items.
 *
 * Throws:
 *   - InventoryItemNotFoundError if the id does not resolve in this tenant
 *   - InvalidTransitionError if (current → target) is not in ALLOWED_TRANSITIONS
 */
export async function transitionInventoryItem(
  tx: DrizzleTx,
  id: string,
  target: InventoryStatus,
  patch: TransitionPatch = {},
): Promise<InventoryItem> {
  // Row-level lock per docs/WORKFLOWS.md — block any other transition on this
  // serial until the surrounding transaction commits.
  const locked = await tx.execute<{ id: string; status: InventoryStatus }>(sql`
    SELECT id, status FROM inventory_items WHERE id = ${id} FOR UPDATE
  `);
  const lockedRow = (locked as unknown as { id: string; status: InventoryStatus }[])[0];
  if (!lockedRow) throw new InventoryItemNotFoundError(id);

  const current = lockedRow.status;
  if (!isAllowed(current, target)) {
    throw new InvalidTransitionError(current, target);
  }

  const now = new Date();
  const updates: Record<string, unknown> = {
    status: target,
    updatedAt: now,
  };

  // Auto-clear / auto-set the ancillary columns based on the target state.
  if (target === 'reserved') {
    updates['reservedAt'] = patch.reservedAt ?? now;
    if (patch.reservedForOrderId !== undefined)
      updates['reservedForOrderId'] = patch.reservedForOrderId;
    if (patch.reservedForDealerId !== undefined)
      updates['reservedForDealerId'] = patch.reservedForDealerId;
  } else if (target === 'in_stock') {
    updates['reservedAt'] = null;
    updates['reservedForOrderId'] = null;
    updates['reservedForDealerId'] = null;
    updates['dispatchId'] = null;
    updates['dispatchedAt'] = null;
  } else if (target === 'dispatched') {
    updates['dispatchedAt'] = patch.dispatchedAt ?? now;
    if (patch.dispatchId !== undefined) updates['dispatchId'] = patch.dispatchId;
  } else if (target === 'delivered') {
    updates['deliveredAt'] = patch.deliveredAt ?? now;
    if (patch.deliveredTo !== undefined) updates['deliveredTo'] = patch.deliveredTo;
  }

  if (patch.warehouseCode !== undefined) updates['warehouseCode'] = patch.warehouseCode;
  if (patch.bin !== undefined) updates['bin'] = patch.bin;
  if (patch.notes !== undefined) updates['notes'] = patch.notes;
  if (patch.updatedBy !== undefined) updates['updatedBy'] = patch.updatedBy;

  const [row] = await tx
    .update(inventoryItems)
    .set(updates)
    .where(eq(inventoryItems.id, id))
    .returning();
  if (!row) throw new InventoryItemNotFoundError(id);
  return row;
}

/**
 * Bulk move: reserve N specific serials for a dealer/order in one
 * transaction. All-or-nothing — any forbidden transition aborts.
 */
export async function reserveSerials(
  tx: DrizzleTx,
  ids: string[],
  patch: TransitionPatch,
): Promise<InventoryItem[]> {
  const out: InventoryItem[] = [];
  for (const id of ids) {
    out.push(await transitionInventoryItem(tx, id, 'reserved', patch));
  }
  return out;
}

/**
 * Look up the current status of an inventory item without locking. Useful
 * for dashboard reads — never use this before a transition (use
 * transitionInventoryItem which takes the lock).
 */
export async function getInventoryItemStatus(
  tx: DrizzleTx,
  id: string,
): Promise<InventoryStatus | null> {
  const [row] = await tx
    .select({ status: inventoryItems.status })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.id, id)))
    .limit(1);
  return row?.status ?? null;
}
