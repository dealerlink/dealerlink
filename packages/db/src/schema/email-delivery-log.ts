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
 *
 * Day 14 extends the row from a queue marker into a full delivery-state
 * record: the pg-boss `send-email` worker writes `sending`/`sent`/`failed`
 * and the Resend inbound webhook writes `delivered`/`bounced`/`complained`
 * plus the per-event timestamps below.
 *
 * `status` lifecycle (text, not an enum — webhook event names evolve):
 *   queued → sending → sent → delivered
 *                   └→ failed                (provider rejected the send)
 *            sent/delivered → bounced         (hard/soft bounce webhook)
 *            sent/delivered → complained      (spam complaint webhook)
 */
export const emailDeliveryLog = pgTable(
  'email_delivery_log',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid().references(() => tenants.id, { onDelete: 'cascade' }),
    recipient: text().notNull(),
    subject: text().notNull(),
    template: text(),
    status: text().notNull().default('queued'),
    providerMessageId: text(),
    errorMessage: text(),
    meta: jsonb(),
    queuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp({ withTimezone: true }),

    // Day 14 — delivery-event tracking, populated by the Resend webhook.
    deliveredAt: timestamp({ withTimezone: true }),
    openedAt: timestamp({ withTimezone: true }),
    clickedAt: timestamp({ withTimezone: true }),
    bouncedAt: timestamp({ withTimezone: true }),
    bouncedType: text(), // 'hard' | 'soft'
    bouncedReason: text(),
    complainedAt: timestamp({ withTimezone: true }),
    lastEventAt: timestamp({ withTimezone: true }),
    lastEventType: text(),
  },
  (t) => [
    index('email_delivery_tenant_ix').on(t.tenantId, t.queuedAt),
    index('email_delivery_recipient_ix').on(t.recipient),
    index('email_delivery_status_ix').on(t.status),
    // Webhook lookup: the inbound handler finds the row by provider message id.
    index('email_delivery_provider_msg_ix').on(t.tenantId, t.providerMessageId),
    // Recent-activity views (delivery dashboard, stuck-queue checks).
    index('email_delivery_status_event_ix').on(t.tenantId, t.status, t.lastEventAt.desc()),
  ],
);

/** The full set of `status` values an email_delivery_log row can hold. */
export const EMAIL_DELIVERY_STATUSES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'bounced',
  'complained',
  'failed',
] as const;
export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

export type EmailDeliveryRow = typeof emailDeliveryLog.$inferSelect;
export type NewEmailDeliveryRow = typeof emailDeliveryLog.$inferInsert;
