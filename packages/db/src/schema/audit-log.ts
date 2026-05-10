import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    action: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    changedBy: uuid(),
    changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: text(),
    userAgent: text(),
  },
  (t) => [
    index('audit_log_tenant_ix').on(t.tenantId),
    index('audit_log_entity_ix').on(t.tenantId, t.entityType, t.entityId),
    index('audit_log_changed_ix').on(t.changedAt),
  ],
);

export type AuditLogEntry = typeof auditLog.$inferSelect;
