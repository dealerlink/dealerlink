import { sql } from 'drizzle-orm';
import {
  check,
  date,
  decimal,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { products } from './product';
import { tenants } from './tenant';
import { users } from './user';

export const procurementStatus = pgEnum('procurement_status', ['draft', 'confirmed', 'received']);

export const inventoryItemStatus = pgEnum('inventory_item_status', [
  'in_stock',
  'reserved',
  'dispatched',
  'delivered',
  'returned',
  'damaged',
  'lost',
]);

export const procurements = pgTable(
  'procurements',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    procurementDate: date().notNull(),
    supplierName: text().notNull(),
    invoiceNumber: text(),
    invoiceDate: date(),
    totalAmount: decimal({ precision: 14, scale: 2 }),
    notes: text(),

    status: procurementStatus().notNull().default('draft'),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('procurements_tenant_status_ix').on(t.tenantId, t.status),
    index('procurements_tenant_date_ix').on(t.tenantId, t.procurementDate),
    check('procurements_total_chk', sql`${t.totalAmount} IS NULL OR ${t.totalAmount} >= 0`),
  ],
);

export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    serialNumber: text(),

    status: inventoryItemStatus().notNull().default('in_stock'),

    warehouseCode: text(),
    bin: text(),

    procurementId: uuid().references(() => procurements.id, { onDelete: 'set null' }),
    procurementDate: date(),
    purchasePrice: decimal({ precision: 14, scale: 2 }),

    // FK to orders/dispatches deferred — those tables don't exist yet.
    reservedForOrderId: uuid(),
    reservedForDealerId: uuid(),
    reservedAt: timestamp({ withTimezone: true }),

    dispatchId: uuid(),
    dispatchedAt: timestamp({ withTimezone: true }),

    deliveredAt: timestamp({ withTimezone: true }),
    deliveredTo: text(),

    warrantyStartDate: date(),
    warrantyEndDate: date(),
    notes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('inventory_items_tenant_serial_uq')
      .on(t.tenantId, t.serialNumber)
      .where(sql`${t.serialNumber} IS NOT NULL`),
    index('inventory_items_tenant_status_product_ix').on(t.tenantId, t.status, t.productId),
    index('inventory_items_tenant_product_status_ix').on(t.tenantId, t.productId, t.status),
    index('inventory_items_tenant_dealer_ix').on(t.tenantId, t.reservedForDealerId),
    check(
      'inventory_items_purchase_chk',
      sql`${t.purchasePrice} IS NULL OR ${t.purchasePrice} >= 0`,
    ),
  ],
);

export type Procurement = typeof procurements.$inferSelect;
export type NewProcurement = typeof procurements.$inferInsert;
export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
