import {
  boolean,
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
    // True when the user must rotate their password on next login. Set when
    // an operator provisions or resets a tenant user; cleared on successful
    // password change.
    mustChangePassword: boolean().notNull().default(false),
    // F-3 (Stage D D.2): cumulative failed-login counter + soft-lockout window.
    // The counter increments on every failed verify and is cleared on success
    // or when the lockout threshold (10) fires; `lockoutUntil` carries a
    // 30-minute lockout from that moment. Independent of the short-window
    // login rate-limit (5/15 min) which lives in `rate_limit` and catches
    // unknown emails too. Lucia attributes do NOT expose these — they exist
    // only for the login action + operator's manual-clear runbook.
    failedLoginAttempts: integer().notNull().default(0),
    lockoutUntil: timestamp({ withTimezone: true }),
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
