import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Raw audit log for every inbound webhook Dealerlink receives (Day 14).
 *
 * This is deliberately a low-level forensic table, not a tenant-scoped
 * business entity:
 *
 *  - There is NO `tenant_id`. A webhook arrives before any tenant context
 *    is known; the processing step routes the event to the right tenant by
 *    correlating `provider_message_id` against `email_delivery_log`.
 *  - RLS is therefore DISABLED on this table (see rls/webhook-events.sql).
 *    It is operator-only data — the webhook route handler writes it with
 *    `adminDb` (the BYPASSRLS migrations role).
 *  - Every request is logged, including signature-verification FAILURES
 *    (`signatureVerified = false`), so a forged-payload attempt leaves a
 *    trail.
 *
 * `provider` is open-ended text (`'resend'` today; future providers reuse
 * the same table). Replay protection: the `(provider, payload->>'id')`
 * unique index rejects a re-delivered event — Resend stamps every event
 * with a stable `id`.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid().primaryKey().defaultRandom(),
    provider: text().notNull(),
    eventType: text().notNull(),
    payload: jsonb().notNull(),
    signatureVerified: boolean().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
    processingError: text(),
  },
  (t) => [
    index('webhook_events_provider_received_ix').on(t.provider, t.receivedAt.desc()),
    // Replay protection — a re-delivered provider event id is rejected.
    uniqueIndex('webhook_events_provider_event_uq').on(t.provider, sql`(${t.payload} ->> 'id')`),
  ],
);

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;
