import { sql } from 'drizzle-orm';
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    gstin: text(),
    pan: text(),

    addressLine1: text(),
    addressLine2: text(),
    addressCity: text(),
    addressState: text(),
    addressPincode: text(),
    addressCountry: text().notNull().default('IN'),

    state: text(),

    bankName: text(),
    bankAccountNumber: text(),
    bankIfsc: text(),
    bankBranch: text(),

    logoUrl: text(),
    primaryColor: text(),

    docPrefixes: jsonb().notNull().default({
      quotation: 'QT',
      proforma: 'PI',
      order: 'ORD',
      invoice: 'INV',
      payment: 'PAY',
      dispatch: 'DSP',
    }),

    fiscalYearStart: integer().notNull().default(4),
    defaultCurrency: text().notNull().default('INR'),
    defaultLocale: text().notNull().default('en-IN'),
    defaultQuoteValidity: integer().notNull().default(15),
    defaultTerms: text(),
    defaultCreditPeriod: integer().notNull().default(30),
    lowStockThreshold: integer().notNull().default(50),

    inboundEmailToken: text(),

    notificationPrefs: jsonb().notNull().default({
      lowStock: true,
      overduePayment: true,
      quoteExpiry: true,
    }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tenant_settings_tenant_uq').on(t.tenantId),
    uniqueIndex('tenant_settings_inbound_token_uq')
      .on(t.inboundEmailToken)
      .where(sql`${t.inboundEmailToken} IS NOT NULL`),
  ],
);

export type TenantSettings = typeof tenantSettings.$inferSelect;
export type NewTenantSettings = typeof tenantSettings.$inferInsert;
