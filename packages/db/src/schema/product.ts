import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  decimal,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { tenants } from './tenant';
import { users } from './user';

export const productStatus = pgEnum('product_status', ['active', 'inactive', 'discontinued']);

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    // Identity
    sku: text().notNull(),
    name: text().notNull(),
    description: text(),
    manufacturer: text(),
    model: text(),

    // Tax
    hsnCode: text().notNull(),
    gstRate: decimal({ precision: 5, scale: 2 }).notNull(),

    // Classification
    category: text(),
    subcategory: text(),

    // Vertical-specific specs
    specs: jsonb().notNull().default({}),

    // Pricing
    mrp: decimal({ precision: 14, scale: 2 }),
    defaultPurchasePrice: decimal({ precision: 14, scale: 2 }),
    defaultSellingPrice: decimal({ precision: 14, scale: 2 }),

    // Inventory hints
    requiresSerial: boolean().notNull().default(true),
    unitOfMeasure: text().notNull().default('Nos'),

    // Status
    status: productStatus().notNull().default('active'),

    // Standard audit columns
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('products_tenant_sku_uq').on(t.tenantId, t.sku),
    index('products_tenant_status_ix').on(t.tenantId, t.status, t.category),
    index('products_tenant_manufacturer_ix').on(t.tenantId, t.manufacturer),
    index('products_tenant_category_ix').on(t.tenantId, t.category, t.subcategory),
    check('products_hsn_chk', sql`${t.hsnCode} ~ '^[0-9]{4,8}$'`),
    check('products_gst_rate_chk', sql`${t.gstRate} IN (0, 5, 12, 18, 28)`),
    check('products_mrp_chk', sql`${t.mrp} IS NULL OR ${t.mrp} >= 0`),
    check(
      'products_purchase_chk',
      sql`${t.defaultPurchasePrice} IS NULL OR ${t.defaultPurchasePrice} >= 0`,
    ),
    check(
      'products_selling_chk',
      sql`${t.defaultSellingPrice} IS NULL OR ${t.defaultSellingPrice} >= 0`,
    ),
  ],
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
