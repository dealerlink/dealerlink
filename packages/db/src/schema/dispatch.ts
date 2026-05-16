import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dealers } from './dealer';
import { inventoryItems } from './inventory';
import { orderLines, orders } from './order';
import { products } from './product';
import { tenants } from './tenant';
import { users } from './user';

/**
 * Dispatch — the physical-fulfilment document (Day 13). A dispatch moves
 * serialised inventory out of the warehouse against a confirmed order.
 *
 * Lifecycle (see packages/db/src/dispatch/transitions.ts):
 *   in_transit ─deliver─▶ delivered
 *        └──────return──▶ returned
 *
 * A dispatch is tax-neutral — it is NOT a tax invoice (that is a Phase 2
 * module). It always ships to the Ship-To dealer (CLAUDE.md §6 — physical
 * goods follow the consignee); Bill-To is carried for reference only.
 */
export const DISPATCH_STATUSES = ['in_transit', 'delivered', 'returned'] as const;

export const dispatches = pgTable(
  'dispatches',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identity (auto-generated per fiscal year via document_counters — DSP-2026-0001)
    dispatchNumber: text().notNull(),

    // Source order — every dispatch comes from a confirmed order.
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    // Three-party snapshot, copied from the order; immutable once dispatched.
    billToDealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),
    shipToDealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),

    // Logistics
    dispatchDate: date().notNull().defaultNow(),
    expectedDeliveryDate: date(),
    vehicleNumber: text(),
    transporterName: text(),
    transporterDocketNumber: text(),
    driverName: text(),
    driverPhone: text(),

    // E-way bill placeholder — Phase 2 wires the real GST API; today this is
    // just a manually-entered number/date.
    ewayBillNumber: text(),
    ewayBillDate: date(),

    // Lifecycle status — see transitions.ts.
    status: text().notNull().default('in_transit'),
    deliveredAt: timestamp({ withTimezone: true }),
    deliveredAcknowledgedBy: text(),
    returnedAt: timestamp({ withTimezone: true }),
    returnedReason: text(),

    notes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (t) => [
    uniqueIndex('dispatches_tenant_number_uq').on(t.tenantId, t.dispatchNumber),
    index('dispatches_tenant_status_date_ix').on(t.tenantId, t.status, t.dispatchDate),
    index('dispatches_tenant_order_ix').on(t.tenantId, t.orderId),
    index('dispatches_tenant_shipto_ix').on(t.tenantId, t.shipToDealerId),
    check('dispatches_status_chk', sql`${t.status} IN ('in_transit', 'delivered', 'returned')`),
  ],
);

/**
 * One dispatch line — mirrors the order_line being fulfilled. The serial
 * numbers picked for this line live in `dispatch_serials`.
 */
export const dispatchLines = pgTable(
  'dispatch_lines',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dispatchId: uuid()
      .notNull()
      .references(() => dispatches.id, { onDelete: 'cascade' }),

    lineNumber: integer().notNull(),
    orderLineId: uuid()
      .notNull()
      .references(() => orderLines.id, { onDelete: 'restrict' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    productSku: text().notNull(),
    productName: text().notNull(),

    // Quantity dispatched on this line — equals the count of dispatch_serials.
    quantity: numeric({ precision: 12, scale: 3 }).notNull(),

    notes: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dispatch_lines_dispatch_pos_uq').on(t.dispatchId, t.lineNumber),
    index('dispatch_lines_tenant_dispatch_ix').on(t.tenantId, t.dispatchId),
    index('dispatch_lines_tenant_orderline_ix').on(t.tenantId, t.orderLineId),
    check('dispatch_lines_qty_chk', sql`${t.quantity} > 0`),
  ],
);

/**
 * The exact serials (inventory_items) shipped on a dispatch line. The
 * `UNIQUE (tenant_id, inventory_item_id)` constraint is the database-level
 * backstop guaranteeing a physical serial can never appear in two dispatches
 * — even under a concurrent race that slips past the status state machine.
 */
export const dispatchSerials = pgTable(
  'dispatch_serials',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dispatchId: uuid()
      .notNull()
      .references(() => dispatches.id, { onDelete: 'cascade' }),
    dispatchLineId: uuid()
      .notNull()
      .references(() => dispatchLines.id, { onDelete: 'cascade' }),
    inventoryItemId: uuid()
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'restrict' }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dispatch_serials_tenant_item_uq').on(t.tenantId, t.inventoryItemId),
    index('dispatch_serials_tenant_dispatch_ix').on(t.tenantId, t.dispatchId),
    index('dispatch_serials_tenant_line_ix').on(t.tenantId, t.dispatchLineId),
  ],
);

export type Dispatch = typeof dispatches.$inferSelect;
export type NewDispatch = typeof dispatches.$inferInsert;
export type DispatchLine = typeof dispatchLines.$inferSelect;
export type NewDispatchLine = typeof dispatchLines.$inferInsert;
export type DispatchSerial = typeof dispatchSerials.$inferSelect;
export type NewDispatchSerial = typeof dispatchSerials.$inferInsert;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];
