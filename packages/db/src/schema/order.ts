import { sql } from 'drizzle-orm';
import {
  check,
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deals } from './deal';
import { dealers } from './dealer';
import { performaInvoices } from './performa-invoice';
import { products } from './product';
import { quotations } from './quotation';
import { tenants } from './tenant';
import { users } from './user';

/**
 * Order fulfilment lifecycle. Orders are created (status `pending`) by
 * confirming a PI; `confirmed` reserves inventory; dispatch (Day 13) moves
 * through `partially_dispatched` / `fully_dispatched`; `cancelled` is an
 * admin-only escape from any non-terminal state and releases reservations.
 */
export const orderStatus = pgEnum('order_status', [
  'pending',
  'confirmed',
  'partially_dispatched',
  'fully_dispatched',
  'delivered',
  'closed',
  'cancelled',
]);

/** Payment progress — a dimension orthogonal to the fulfilment status. */
export const orderPaymentStatus = pgEnum('order_payment_status', [
  'unpaid',
  'partially_paid',
  'paid',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identity (auto-generated per fiscal year via document_counters)
    orderNumber: text().notNull(),

    // Source PI — every order comes from a confirmed PI in Phase 1.
    performaInvoiceId: uuid()
      .notNull()
      .references(() => performaInvoices.id, { onDelete: 'restrict' }),
    quotationId: uuid()
      .notNull()
      .references(() => quotations.id, { onDelete: 'restrict' }),
    dealId: uuid().references(() => deals.id, { onDelete: 'set null' }),

    // Three-party model — copied from the PI; immutable once the order exists.
    billToDealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),
    shipToDealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),

    // placeOfSupply is the SHIP-TO dealer's state (IGST Act §10 — ADR-012).
    tenantStateAtIssue: text().notNull(),
    placeOfSupply: text().notNull(),

    // Commercial
    orderDate: date().notNull().defaultNow(),
    expectedDispatchDate: date(),
    currency: text().notNull().default('INR'),

    // Snapshot of totals from the PI.
    subtotal: decimal({ precision: 14, scale: 2 }).notNull(),
    discountAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    taxableAmount: decimal({ precision: 14, scale: 2 }).notNull(),
    cgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    sgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    igstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    totalAmount: decimal({ precision: 14, scale: 2 }).notNull(),

    status: orderStatus().notNull().default('pending'),
    confirmedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledReason: text(),

    paymentStatus: orderPaymentStatus().notNull().default('unpaid'),

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
    uniqueIndex('orders_tenant_number_uq').on(t.tenantId, t.orderNumber),
    index('orders_tenant_status_date_ix').on(t.tenantId, t.status, t.orderDate),
    index('orders_tenant_payment_ix').on(t.tenantId, t.paymentStatus),
    index('orders_tenant_billto_ix').on(t.tenantId, t.billToDealerId),
    index('orders_tenant_pi_ix').on(t.tenantId, t.performaInvoiceId),
    index('orders_tenant_deal_ix').on(t.tenantId, t.dealId),
    check(
      'orders_state_codes_chk',
      sql`length(${t.tenantStateAtIssue}) >= 2 AND length(${t.placeOfSupply}) >= 2`,
    ),
    check('orders_subtotal_chk', sql`${t.subtotal} >= 0`),
    check('orders_total_chk', sql`${t.totalAmount} >= 0`),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    lineNumber: integer().notNull(),

    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    productSku: text().notNull(),
    productName: text().notNull(),
    hsnCode: text().notNull(),

    quantity: decimal({ precision: 12, scale: 3 }).notNull(),
    unitOfMeasure: text().notNull().default('Nos'),
    unitPrice: decimal({ precision: 12, scale: 2 }).notNull(),
    gstRate: decimal({ precision: 5, scale: 2 }).notNull(),
    lineTotal: decimal({ precision: 14, scale: 2 }).notNull(),

    // Fulfilment tracking — reserved at order confirmation, dispatched Day 13.
    reservedQuantity: decimal({ precision: 12, scale: 3 }).notNull().default('0'),
    dispatchedQuantity: decimal({ precision: 12, scale: 3 }).notNull().default('0'),

    description: text(),
    notes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('order_lines_order_pos_uq').on(t.orderId, t.lineNumber),
    index('order_lines_tenant_product_ix').on(t.tenantId, t.productId),
    check('order_lines_qty_chk', sql`${t.quantity} > 0`),
    check('order_lines_unit_price_chk', sql`${t.unitPrice} >= 0`),
    check('order_lines_gst_rate_chk', sql`${t.gstRate} IN (0, 5, 12, 18, 28)`),
    check('order_lines_total_chk', sql`${t.lineTotal} >= 0`),
    check(
      'order_lines_reserved_chk',
      sql`${t.reservedQuantity} >= 0 AND ${t.reservedQuantity} <= ${t.quantity}`,
    ),
    check(
      'order_lines_dispatched_chk',
      sql`${t.dispatchedQuantity} >= 0 AND ${t.dispatchedQuantity} <= ${t.quantity}`,
    ),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),

    transitionedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    transitionedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    reason: text(),
  },
  (t) => [index('order_status_history_order_ix').on(t.tenantId, t.orderId, t.transitionedAt)],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderLine = typeof orderLines.$inferSelect;
export type NewOrderLine = typeof orderLines.$inferInsert;
export type OrderStatusHistoryRow = typeof orderStatusHistory.$inferSelect;
export type NewOrderStatusHistory = typeof orderStatusHistory.$inferInsert;
export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type OrderPaymentStatus = (typeof orderPaymentStatus.enumValues)[number];
