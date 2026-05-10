import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';

export const userRole = pgEnum('user_role', ['admin', 'sales', 'accounts', 'dispatch', 'operator']);

export const userStatus = pgEnum('user_status', ['active', 'invited', 'suspended', 'deleted']);

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Operators (platform-level) have null tenant_id; tenant users do not.
    tenantId: uuid().references(() => tenants.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    passwordHash: text().notNull(),
    role: userRole().notNull(),
    fullName: text().notNull(),
    status: userStatus().notNull().default('active'),
    lastAuthEventAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_tenant_email_uq').on(t.tenantId, t.email),
    index('users_tenant_ix').on(t.tenantId),
    index('users_email_ix').on(t.email),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
