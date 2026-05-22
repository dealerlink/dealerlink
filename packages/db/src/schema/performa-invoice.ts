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
import { products } from './product';
import { quotations } from './quotation';
import { tenants } from './tenant';
import { users } from './user';

/**
 * Performa Invoice (PI) lifecycle. A PI is always converted from an accepted
 * quotation in Phase 1. `confirmed` PIs are immutable and have spawned an
 * Order; `cancelled` is terminal.
 */
export const performaInvoiceStatus = pgEnum('performa_invoice_status', [
  'draft',
  'sent',
  'confirmed',
  'cancelled',
  // Day 14: a `sent` PI whose validity lapsed without confirmation is moved
  // to `expired` by the daily validity-expiry job. Terminal.
  'expired',
]);

export const performaInvoiceDiscountType = pgEnum('performa_invoice_discount_type', [
  'percent',
  'amount',
]);

export const performaInvoices = pgTable(
  'performa_invoices',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identity (auto-generated per fiscal year via document_counters)
    piNumber: text().notNull(),

    // Source quotation — PIs always come from accepted quotations in Phase 1.
    quotationId: uuid()
      .notNull()
      .references(() => quotations.id, { onDelete: 'restrict' }),

    // Deal link (denormalized from the quotation for fast queries).
    dealId: uuid().references(() => deals.id, { onDelete: 'set null' }),

    // Three-party model (CLAUDE.md §5). Bill-To pays; Ship-To receives goods.
    billToDealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),
    shipToDealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),

    // Tax-engine inputs captured at issuance — never recomputed from masters.
    // placeOfSupply is the SHIP-TO dealer's state (IGST Act §10 — ADR-012).
    tenantStateAtIssue: text().notNull(),
    placeOfSupply: text().notNull(),

    preparedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    // Commercial (snapshot from the source quotation; validity may adjust).
    piDate: date().notNull().defaultNow(),
    validUntil: date().notNull(),
    currency: text().notNull().default('INR'),

    discountType: performaInvoiceDiscountType(),
    discountValue: decimal({ precision: 12, scale: 2 }),

    // Denormalized totals — recomputed authoritatively via @dealerlink/tax.
    subtotal: decimal({ precision: 14, scale: 2 }).notNull(),
    discountAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    taxableAmount: decimal({ precision: 14, scale: 2 }).notNull(),
    cgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    sgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    igstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    totalAmount: decimal({ precision: 14, scale: 2 }).notNull(),

    termsAndConditions: text(),
    notes: text(),

    status: performaInvoiceStatus().notNull().default('draft'),
    sentAt: timestamp({ withTimezone: true }),
    confirmedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    cancelledReason: text(),

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
    uniqueIndex('performa_invoices_tenant_number_uq').on(t.tenantId, t.piNumber),
    index('performa_invoices_tenant_status_date_ix').on(t.tenantId, t.status, t.piDate),
    index('performa_invoices_tenant_billto_ix').on(t.tenantId, t.billToDealerId),
    index('performa_invoices_tenant_quotation_ix').on(t.tenantId, t.quotationId),
    index('performa_invoices_tenant_deal_ix').on(t.tenantId, t.dealId),
    // ISO 3166-2:IN 2-letter codes (DEV.33, normalized Stage C Day C.2).
    check(
      'performa_invoices_state_codes_chk',
      sql`${t.tenantStateAtIssue} ~ '^[A-Z]{2}$' AND ${t.placeOfSupply} ~ '^[A-Z]{2}$'`,
    ),
    check(
      'performa_invoices_discount_value_chk',
      sql`(${t.discountType} IS NULL AND ${t.discountValue} IS NULL) OR (${t.discountType} IS NOT NULL AND ${t.discountValue} IS NOT NULL AND ${t.discountValue} > 0)`,
    ),
    check(
      'performa_invoices_discount_percent_chk',
      sql`${t.discountType} <> 'percent' OR ${t.discountValue} <= 100`,
    ),
    check('performa_invoices_subtotal_chk', sql`${t.subtotal} >= 0`),
    check('performa_invoices_total_chk', sql`${t.totalAmount} >= 0`),
    check('performa_invoices_validity_chk', sql`${t.validUntil} >= ${t.piDate}`),
  ],
);

export const performaInvoiceLines = pgTable(
  'performa_invoice_lines',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    performaInvoiceId: uuid()
      .notNull()
      .references(() => performaInvoices.id, { onDelete: 'cascade' }),

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

    description: text(),
    notes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('performa_invoice_lines_pi_pos_uq').on(t.performaInvoiceId, t.lineNumber),
    index('performa_invoice_lines_tenant_product_ix').on(t.tenantId, t.productId),
    check('performa_invoice_lines_qty_chk', sql`${t.quantity} > 0`),
    check('performa_invoice_lines_unit_price_chk', sql`${t.unitPrice} >= 0`),
    check('performa_invoice_lines_gst_rate_chk', sql`${t.gstRate} IN (0, 5, 12, 18, 28)`),
    check('performa_invoice_lines_total_chk', sql`${t.lineTotal} >= 0`),
  ],
);

export const performaInvoiceStatusHistory = pgTable(
  'performa_invoice_status_history',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    performaInvoiceId: uuid()
      .notNull()
      .references(() => performaInvoices.id, { onDelete: 'cascade' }),

    fromStatus: performaInvoiceStatus(),
    toStatus: performaInvoiceStatus().notNull(),

    transitionedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    transitionedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    reason: text(),
  },
  (t) => [
    index('performa_invoice_status_history_pi_ix').on(
      t.tenantId,
      t.performaInvoiceId,
      t.transitionedAt,
    ),
  ],
);

export type PerformaInvoice = typeof performaInvoices.$inferSelect;
export type NewPerformaInvoice = typeof performaInvoices.$inferInsert;
export type PerformaInvoiceLine = typeof performaInvoiceLines.$inferSelect;
export type NewPerformaInvoiceLine = typeof performaInvoiceLines.$inferInsert;
export type PerformaInvoiceStatusHistoryRow = typeof performaInvoiceStatusHistory.$inferSelect;
export type NewPerformaInvoiceStatusHistory = typeof performaInvoiceStatusHistory.$inferInsert;
export type PerformaInvoiceStatus = (typeof performaInvoiceStatus.enumValues)[number];
export type PerformaInvoiceDiscountType = (typeof performaInvoiceDiscountType.enumValues)[number];
