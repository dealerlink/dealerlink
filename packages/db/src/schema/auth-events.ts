import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';
import { users } from './user';

export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().references(() => tenants.id, { onDelete: 'set null' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    eventType: text().notNull(),
    success: boolean().notNull(),
    ip: text(),
    userAgent: text(),
    metadata: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_events_tenant_ix').on(t.tenantId, t.createdAt),
    index('auth_events_user_ix').on(t.userId, t.createdAt),
    index('auth_events_type_ix').on(t.eventType, t.createdAt),
  ],
);

export type AuthEvent = typeof authEvents.$inferSelect;
export type NewAuthEvent = typeof authEvents.$inferInsert;
