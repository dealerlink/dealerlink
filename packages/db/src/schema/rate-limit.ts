import { bigint, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Postgres-backed rate limiter. One row per (key, window_start).
 *
 * Deliberately NOT tenant-scoped: keyed by IP for login + health endpoints,
 * which fire before any tenant context exists. The key encodes the
 * limited surface (e.g., `login:1.2.3.4`, `health:1.2.3.4`).
 */
export const rateLimit = pgTable(
  'rate_limit',
  {
    key: text().notNull(),
    windowStart: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    count: bigint({ mode: 'number' }).notNull().default(0),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rate_limit_key_window_uq').on(t.key, t.windowStart)],
);

export type RateLimit = typeof rateLimit.$inferSelect;
