import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    legalName: text().notNull(),
    displayName: text().notNull(),
    status: text().notNull().default('active'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('tenants_slug_uq').on(t.slug),
    index('tenants_status_ix').on(t.status),
    check('tenants_slug_chk', sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'`),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
