import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';

/**
 * History of retired inbound-email tokens. When an operator rotates a
 * tenant's inbound token, the OLD value is recorded here with a 7-day
 * grace window. The Resend inbound webhook (built in Day 14) checks both
 * the current `tenant_settings.inbound_email_token` and this table; matches
 * found here keep working until `expires_at` so existing BCC instructions
 * don't break instantly.
 */
export const inboundTokenHistory = pgTable(
  'inbound_token_history',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    retiredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    index('inbound_token_history_tenant_ix').on(t.tenantId, t.expiresAt),
    index('inbound_token_history_token_ix').on(t.token, t.expiresAt),
  ],
);

export type InboundTokenHistoryRow = typeof inboundTokenHistory.$inferSelect;
export type NewInboundTokenHistoryRow = typeof inboundTokenHistory.$inferInsert;
