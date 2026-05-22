import { sql } from 'drizzle-orm';
import {
  check,
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

import { tenants } from './tenant';
import { users } from './user';

export const dealerType = pgEnum('dealer_type', [
  'retailer',
  'wholesaler',
  'installer',
  'epc',
  'other',
]);

export const dealerCategory = pgEnum('dealer_category', ['A', 'B', 'C']);

export const dealerRiskLevel = pgEnum('dealer_risk_level', ['low', 'medium', 'high']);

export const dealerStatus = pgEnum('dealer_status', ['active', 'inactive', 'on_hold']);

export const dealers = pgTable(
  'dealers',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identity
    dealerCode: text().notNull(),
    legalName: text().notNull(),
    displayName: text().notNull(),
    contactPerson: text(),
    phone: text(),
    altPhone: text(),
    email: text(),
    altEmail: text(),

    // Address
    addressLine1: text(),
    addressLine2: text(),
    city: text(),
    state: text(),
    pincode: text(),
    country: text().notNull().default('IN'),

    // Compliance
    gstin: text(),
    pan: text(),

    // Classification
    type: dealerType().notNull().default('retailer'),
    category: dealerCategory().notNull().default('B'),
    riskLevel: dealerRiskLevel().notNull().default('low'),

    // Commercial terms
    creditLimit: decimal({ precision: 14, scale: 2 }),
    creditPeriodDays: integer(),
    discountPercent: decimal({ precision: 5, scale: 2 }).notNull().default('0'),

    // Status
    status: dealerStatus().notNull().default('active'),
    inactivatedAt: timestamp({ withTimezone: true }),
    inactivatedReason: text(),

    // Misc
    notes: text(),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),

    // Standard audit columns
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('dealers_tenant_code_uq').on(t.tenantId, t.dealerCode),
    uniqueIndex('dealers_tenant_gstin_uq')
      .on(t.tenantId, t.gstin)
      .where(sql`${t.gstin} IS NOT NULL`),
    index('dealers_tenant_status_ix').on(t.tenantId, t.status),
    index('dealers_tenant_type_ix').on(t.tenantId, t.type),
    index('dealers_tenant_category_ix').on(t.tenantId, t.category),
    index('dealers_tenant_risk_ix').on(t.tenantId, t.riskLevel),
    index('dealers_tenant_state_ix').on(t.tenantId, t.state),
    check('dealers_credit_limit_chk', sql`${t.creditLimit} IS NULL OR ${t.creditLimit} >= 0`),
    check(
      'dealers_credit_period_chk',
      sql`${t.creditPeriodDays} IS NULL OR ${t.creditPeriodDays} >= 0`,
    ),
    check('dealers_discount_chk', sql`${t.discountPercent} >= 0 AND ${t.discountPercent} <= 100`),
    check('dealers_gstin_not_empty_chk', sql`${t.gstin} IS NULL OR ${t.gstin} <> ''`),
    // ISO 3166-2:IN 2-letter code, or NULL when unset (DEV.33, Stage C Day C.2).
    check('dealers_state_chk', sql`${t.state} IS NULL OR ${t.state} ~ '^[A-Z]{2}$'`),
  ],
);

export type Dealer = typeof dealers.$inferSelect;
export type NewDealer = typeof dealers.$inferInsert;
