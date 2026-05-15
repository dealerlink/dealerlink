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
import { tenants } from './tenant';
import { users } from './user';

export const quotationStatus = pgEnum('quotation_status', [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'superseded',
]);

export const quotationDiscountType = pgEnum('quotation_discount_type', ['percent', 'amount']);

export const quotationSentVia = pgEnum('quotation_sent_via', [
  'email',
  'pdf_download',
  'in_person',
]);

export const quotations = pgTable(
  'quotations',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identity (auto-generated per fiscal year via document_counters)
    quoteNumber: text().notNull(),
    revision: integer().notNull().default(1),
    parentQuotationId: uuid(),

    // Relationships
    dealId: uuid().references(() => deals.id, { onDelete: 'set null' }),
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),
    preparedBy: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    // Tax-engine inputs captured at issuance — never recomputed from dealer/tenant.
    tenantStateAtIssue: text().notNull(),
    placeOfSupply: text().notNull(),

    // Commercial
    quoteDate: date().notNull().defaultNow(),
    validUntil: date().notNull(),
    currency: text().notNull().default('INR'),

    discountType: quotationDiscountType(),
    discountValue: decimal({ precision: 12, scale: 2 }),

    // Denormalized totals — recomputed authoritatively on every server write.
    subtotal: decimal({ precision: 14, scale: 2 }).notNull(),
    discountAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    taxableAmount: decimal({ precision: 14, scale: 2 }).notNull(),
    cgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    sgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    igstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
    totalAmount: decimal({ precision: 14, scale: 2 }).notNull(),

    // Terms
    termsAndConditions: text(),
    notes: text(),

    // Status
    status: quotationStatus().notNull().default('draft'),
    sentAt: timestamp({ withTimezone: true }),
    sentVia: quotationSentVia(),
    acceptedAt: timestamp({ withTimezone: true }),
    rejectedAt: timestamp({ withTimezone: true }),
    rejectedReason: text(),

    // Audit
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
    uniqueIndex('quotations_tenant_number_rev_uq').on(t.tenantId, t.quoteNumber, t.revision),
    index('quotations_tenant_status_date_ix').on(t.tenantId, t.status, t.quoteDate),
    index('quotations_tenant_dealer_date_ix').on(t.tenantId, t.dealerId, t.quoteDate),
    index('quotations_tenant_deal_ix').on(t.tenantId, t.dealId),
    index('quotations_tenant_prepared_ix').on(t.tenantId, t.preparedBy),
    index('quotations_tenant_parent_ix').on(t.tenantId, t.parentQuotationId),
    check('quotations_revision_chk', sql`${t.revision} >= 1`),
    check(
      'quotations_state_codes_chk',
      sql`length(${t.tenantStateAtIssue}) >= 2 AND length(${t.placeOfSupply}) >= 2`,
    ),
    check(
      'quotations_discount_value_chk',
      sql`(${t.discountType} IS NULL AND ${t.discountValue} IS NULL) OR (${t.discountType} IS NOT NULL AND ${t.discountValue} IS NOT NULL AND ${t.discountValue} > 0)`,
    ),
    check(
      'quotations_discount_percent_chk',
      sql`${t.discountType} <> 'percent' OR ${t.discountValue} <= 100`,
    ),
    check('quotations_subtotal_chk', sql`${t.subtotal} >= 0`),
    check('quotations_total_chk', sql`${t.totalAmount} >= 0`),
    check('quotations_validity_chk', sql`${t.validUntil} >= ${t.quoteDate}`),
  ],
);

export const quotationLines = pgTable(
  'quotation_lines',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    quotationId: uuid()
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),

    lineNumber: integer().notNull(),

    // Product snapshot — source of truth for tax engine.
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    productSku: text().notNull(),
    productName: text().notNull(),
    hsnCode: text().notNull(),

    quantity: decimal({ precision: 12, scale: 3 }).notNull(),
    unitOfMeasure: text().notNull().default('Nos'),
    unitPrice: decimal({ precision: 12, scale: 2 }).notNull(),

    // CRITICAL: gst_rate is the source of truth for Day 9 tax engine.
    gstRate: decimal({ precision: 5, scale: 2 }).notNull(),

    lineTotal: decimal({ precision: 14, scale: 2 }).notNull(),

    description: text(),
    notes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('quotation_lines_quote_pos_uq').on(t.quotationId, t.lineNumber),
    index('quotation_lines_tenant_product_ix').on(t.tenantId, t.productId),
    check('quotation_lines_qty_chk', sql`${t.quantity} > 0`),
    check('quotation_lines_unit_price_chk', sql`${t.unitPrice} >= 0`),
    check('quotation_lines_gst_rate_chk', sql`${t.gstRate} IN (0, 5, 12, 18, 28)`),
    check('quotation_lines_total_chk', sql`${t.lineTotal} >= 0`),
  ],
);

export const quotationStatusHistory = pgTable(
  'quotation_status_history',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    quotationId: uuid()
      .notNull()
      .references(() => quotations.id, { onDelete: 'cascade' }),

    fromStatus: quotationStatus(),
    toStatus: quotationStatus().notNull(),

    transitionedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    transitionedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    reason: text(),
  },
  (t) => [
    index('quotation_status_history_quote_ix').on(t.tenantId, t.quotationId, t.transitionedAt),
  ],
);

export type Quotation = typeof quotations.$inferSelect;
export type NewQuotation = typeof quotations.$inferInsert;
export type QuotationLine = typeof quotationLines.$inferSelect;
export type NewQuotationLine = typeof quotationLines.$inferInsert;
export type QuotationStatusHistory = typeof quotationStatusHistory.$inferSelect;
export type NewQuotationStatusHistory = typeof quotationStatusHistory.$inferInsert;
export type QuotationStatus = (typeof quotationStatus.enumValues)[number];
export type QuotationDiscountType = (typeof quotationDiscountType.enumValues)[number];
export type QuotationSentVia = (typeof quotationSentVia.enumValues)[number];
