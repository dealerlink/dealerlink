import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';
import { users } from './user';

/**
 * F.148 — credentials for the Tally agent, the first Dealerlink component that
 * runs on a TENANT'S OWN machine rather than on our infrastructure.
 *
 * ## WHY A TABLE AND NOT TWO COLUMNS ON `tenant_settings`
 *
 * Operator ruling (OD-4). One tenant may have more than one agent — a second
 * site, or a replacement VPS during a migration — and each must be revocable
 * ALONE. `tenant_settings` is one row per tenant and cannot carry an
 * installation identity, and the read/write scope split below has to be
 * STRUCTURAL now rather than remembered when F.178 lands.
 *
 * ## THE RESOLUTION LOOKUP AGAINST THIS TABLE IS THE ONE EXEMPTION
 *
 * `docs/F148_AGENT_SPEC.md` §3: turning an opaque token into a tenant id cannot
 * run under RLS, because `app.tenant_id` is not known yet — **you cannot scope a
 * lookup by the thing the lookup returns.** So the bootstrap read of this table
 * is exempt, and it is narrowed to the bone: one table, one lookup, returning
 * only a tenant id, failing closed on no match. Everything after it runs
 * `withTenant` on the RLS-enforced connection.
 *
 * **The exemption is ONE STATEMENT WIDE.** If a second unscoped statement
 * appears in the agent's path, it has stopped being an exemption.
 */
export const agentTokens = pgTable(
  'agent_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    /** Operator-facing installation name, e.g. "Ponda VPS". */
    label: text().notNull(),

    // ─────────────────────────────────────────────────────────────────────────
    // THE COLUMN NAME IS A WORKAROUND, NOT A DESIGN CHOICE. READ THIS BEFORE
    // EXTENDING `audit_redact()`.
    //
    // This column holds a SHA-256 DIGEST, never the token itself. **The clearer
    // name is `agent_token_hash`.** It is not used, for one reason only:
    // `audit_redact()` in `src/triggers/audit-log.sql` matches on key NAME —
    // `password_hash`, `inbound_email_token`, `token`, `%_secret`, `%_token` —
    // and `agent_token_hash` ends in `_hash`, so it matches NONE of those and
    // the digest would be written to `audit_log` in the clear. `secret_token`
    // ends in `_token` and is caught.
    //
    // **IF `audit_redact()` IS EVER EXTENDED to cover `%_hash` or an explicit
    // key list, RENAME THIS COLUMN TO `agent_token_hash`.** The accurate name is
    // the one we want; it is unavailable today because the redaction function
    // cannot see it. Whoever touches that function should find this comment —
    // which is why it says so here rather than only in a task note (F.184).
    // ─────────────────────────────────────────────────────────────────────────
    secretToken: text().notNull(),

    /**
     * STRUCTURAL SCOPE, so a read token cannot become a write token by neglect
     * (spec §4). F.178's write path issues its own row with `scope = 'write'`.
     *
     * `text` + CHECK rather than a pgEnum, following the `dispatches_status_chk`
     * and `delivery_arrangement` precedent — adding a member needs no enum
     * migration, and an enum here would make F.178 a schema change.
     */
    scope: text().notNull().default('read'),

    issuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    issuedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp({ withTimezone: true }),
    revokedBy: uuid().references(() => users.id, { onDelete: 'set null' }),

    // ─────────────────────────────────────────────────────────────────────────
    // THE HEARTBEAT. THE READ PATH WRITES EXACTLY THESE TWO COLUMNS, ON EXACTLY
    // THE AUTHENTICATING ROW, AND NOTHING ELSE.
    //
    // Operator ruling: **"read path" means it does not mutate THEIR books, not
    // that it issues no SQL.** `lastSeenAt` is the only thing that makes "the
    // sync isn't working" diagnosable from our side, which spec §6 requires, and
    // giving it a separate home would mean building and securing a second write
    // path for one timestamp.
    //
    // **THE BOUND IS THE POINT, AND IT IS ASSERTED, NOT TRUSTED.** A read
    // request that touches any other table is a DEFECT. That assertion is what
    // keeps "read path" meaningful once F.178 exists — otherwise the phrase
    // decays into "the path we call the read path".
    // See `tests/agent-token.test.ts`.
    // ─────────────────────────────────────────────────────────────────────────
    lastSeenAt: timestamp({ withTimezone: true }),
    agentVersion: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // EXACTLY ONE TENANT PER TOKEN, ENFORCED BY THE DATABASE rather than by
    // code — the `inbound_email_token` partial-unique-index precedent, which is
    // the one thing that token got right (spec §4, F.183 for the rest of it).
    uniqueIndex('agent_tokens_secret_uq').on(t.secretToken),
    index('agent_tokens_tenant_ix').on(t.tenantId),
    check('agent_tokens_scope_chk', sql`${t.scope} IN ('read', 'write')`),
  ],
);

export type AgentToken = typeof agentTokens.$inferSelect;
export type NewAgentToken = typeof agentTokens.$inferInsert;
