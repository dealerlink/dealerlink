import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';
import { users } from './user';

export const accessLog = pgTable(
  'access_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    entityType: text().notNull(),
    entityId: uuid(),
    // 'view' | 'export' | 'download' | 'operator_impersonation_view'
    action: text().notNull(),
    ip: text(),
    userAgent: text(),
    accessedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('access_log_entity_ix').on(t.tenantId, t.entityType, t.entityId),
    index('access_log_user_ix').on(t.tenantId, t.userId, t.accessedAt),
    index('access_log_action_ix').on(t.tenantId, t.action, t.accessedAt),
  ],
);

export type AccessLogEntry = typeof accessLog.$inferSelect;
export type NewAccessLogEntry = typeof accessLog.$inferInsert;
