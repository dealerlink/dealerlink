import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dealers } from './dealer';
import { orders } from './order';
import { performaInvoices } from './performa-invoice';
import { tenants } from './tenant';
import { users } from './user';

/**
 * Payment receipts (Day 12). A payment is money received from a dealer
 * (the Bill-To party per CLAUDE.md §6). Receipts are tax-neutral documents —
 * no GST breakdown, no place-of-supply (ADR-012 is informational here).
 *
 * Lifecycle (see packages/db/src/payments/transitions.ts):
 *   pending_verification ─▶ verified ─▶ cleared ─▶ refunded
 *                              └─▶ bounced
 *
 * `allocatedAmount` is a denormalised mirror of SUM(payment_allocations.amount)
 * for this payment; the invariant is asserted by the Day 12 seed test.
 */
export const PAYMENT_METHODS = ['bank_transfer', 'cheque', 'cash', 'upi', 'card', 'other'] as const;
export const PAYMENT_STATUSES = [
  'pending_verification',
  'verified',
  'cleared',
  'bounced',
  'refunded',
] as const;

export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identity (auto-generated per fiscal year via document_counters)
    paymentNumber: text().notNull(),

    // Payer — the Bill-To dealer of one or more orders/PIs.
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),

    // Money — receipts are tax-neutral; the amount is the full sum received.
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    currency: text().notNull().default('INR'),

    // Method + reference (bank txn id, cheque number, UPI ref, …).
    method: text().notNull(),
    reference: text(),
    receivedDate: date().notNull(),

    // Bank deposit details for accountant reconciliation.
    depositedToBank: text(),
    depositedDate: date(),

    // Lifecycle status — see transitions.ts.
    status: text().notNull().default('pending_verification'),

    // Verification trail.
    verifiedAt: timestamp({ withTimezone: true }),
    verifiedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    clearedAt: timestamp({ withTimezone: true }),
    bouncedAt: timestamp({ withTimezone: true }),
    bouncedReason: text(),
    refundedAt: timestamp({ withTimezone: true }),
    refundedReason: text(),

    // Denormalised allocation summary. Equals SUM(payment_allocations.amount)
    // where payment_id = this.id. Unallocated = amount − allocatedAmount;
    // a positive remainder is an advance / floating credit.
    allocatedAmount: numeric({ precision: 14, scale: 2 }).notNull().default('0'),

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
    uniqueIndex('payments_tenant_number_uq').on(t.tenantId, t.paymentNumber),
    index('payments_tenant_dealer_date_ix').on(t.tenantId, t.dealerId, t.receivedDate.desc()),
    index('payments_tenant_status_date_ix').on(t.tenantId, t.status, t.receivedDate.desc()),
    check('payments_amount_chk', sql`${t.amount} > 0`),
    check(
      'payments_allocated_chk',
      sql`${t.allocatedAmount} >= 0 AND ${t.allocatedAmount} <= ${t.amount}`,
    ),
    check(
      'payments_method_chk',
      sql`${t.method} IN ('bank_transfer', 'cheque', 'cash', 'upi', 'card', 'other')`,
    ),
    check(
      'payments_status_chk',
      sql`${t.status} IN ('pending_verification', 'verified', 'cleared', 'bounced', 'refunded')`,
    ),
  ],
);

/**
 * A single allocation of payment money against an Order or a PI. Exactly one
 * of (orderId, performaInvoiceId) is set. PI allocations are advances that
 * transfer to the spawned order when the PI is confirmed (Day 11 confirmPi).
 */
export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    paymentId: uuid()
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),

    // Allocated against — exactly one of these is set.
    orderId: uuid().references(() => orders.id, { onDelete: 'restrict' }),
    performaInvoiceId: uuid().references(() => performaInvoices.id, { onDelete: 'restrict' }),

    amount: numeric({ precision: 12, scale: 2 }).notNull(),

    allocatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    allocatedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    notes: text(),
  },
  (t) => [
    index('payment_allocations_tenant_payment_ix').on(t.tenantId, t.paymentId),
    index('payment_allocations_tenant_order_ix').on(t.tenantId, t.orderId),
    index('payment_allocations_tenant_pi_ix').on(t.tenantId, t.performaInvoiceId),
    check('payment_allocations_amount_chk', sql`${t.amount} > 0`),
    check(
      'payment_allocations_target_chk',
      sql`(${t.orderId} IS NOT NULL)::int + (${t.performaInvoiceId} IS NOT NULL)::int = 1`,
    ),
  ],
);

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentAllocation = typeof paymentAllocations.$inferSelect;
export type NewPaymentAllocation = typeof paymentAllocations.$inferInsert;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
