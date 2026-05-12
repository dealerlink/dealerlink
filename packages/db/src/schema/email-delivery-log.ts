import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';

/**
 * Append-only delivery record for every outbound message Dealerlink sends
 * (welcome emails, password resets, quotation deliveries, etc.). Per
 * docs/LOGGING.md row #4 this lives in Postgres with 90-day retention; row #2
 * (`email_log`, full body) ships later when outbound quote sends arrive.
 *
 * `tenantId` is nullable so platform-level emails (e.g., operator-issued
 * welcome to a brand-new tenant) can still log. When set, RLS scopes it to
 * the owning tenant.
 */
export const emailDeliveryLog = pgTable(
  'email_delivery_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().references(() => tenants.id, { onDelete: 'cascade' }),
    recipient: text().notNull(),
    subject: text().notNull(),
    template: text(),
    status: text().notNull().default('queued'), // queued|sent|bounced|complained|failed
    providerMessageId: text(),
    errorMessage: text(),
    meta: jsonb(),
    queuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('email_delivery_tenant_ix').on(t.tenantId, t.queuedAt),
    index('email_delivery_recipient_ix').on(t.recipient),
    index('email_delivery_status_ix').on(t.status),
  ],
);

export type EmailDeliveryRow = typeof emailDeliveryLog.$inferSelect;
export type NewEmailDeliveryRow = typeof emailDeliveryLog.$inferInsert;
