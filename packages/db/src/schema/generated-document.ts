import { sql } from 'drizzle-orm';
import { check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tenants } from './tenant';
import { users } from './user';

/**
 * Document types that can be rendered to a PDF. Day 10 implements
 * `quotation`; Day 11 adds `performa_invoice`; `invoice` (tax invoice),
 * `dispatch`, and `payment_receipt` follow in later days. The enum is
 * declared up front so the render-pdf job and the storage table do not need
 * a migration each time a new type ships.
 */
export const generatedDocumentType = pgEnum('generated_document_type', [
  'quotation',
  'performa_invoice',
  'invoice',
  'dispatch',
  'payment_receipt',
  // F.8 / F.144.
  'credit_note',
  'debit_note',
]);

/**
 * ⚠️ ADDING A VALUE HERE — READ THIS FIRST. It is a two-case rule and the easy
 * case is the one that happened, which is why the hard case needs writing down.
 *
 * `ALTER TYPE … ADD VALUE` may run inside a transaction on Postgres 12+, but the
 * NEW VALUE CANNOT BE USED in that same transaction. Drizzle generates the
 * `ADD VALUE` statements and the `CREATE TABLE`s into ONE migration file, and
 * `migrate.ts` applies each file as a unit.
 *
 * **So:**
 *
 *  - If nothing in the migration USES the new value — no column typed with this
 *    enum, no `DEFAULT 'credit_note'`, no CHECK or seed referencing it — one
 *    migration is fine. That was the case for F.6: `credit_note` and
 *    `debit_note` were added while the six new tables used `invoice_status` and
 *    `invoice_discount_type` instead, so no statement touched the new values.
 *    **Verified at the time, not assumed.**
 *  - **The next table that actually references `generated_document_type` with a
 *    new value will FAIL AT APPLY TIME**, with
 *    `unsafe use of new value "…" of enum type`. It needs the `ADD VALUE` split
 *    into its own earlier migration, which means hand-splitting what
 *    `drizzle-kit generate` produced — the generator will not do it for you and
 *    will not warn.
 *
 * An earlier version of F.6's own DDL review asserted the split was required
 * outright. That was wrong in the direction that costs nothing, and the
 * conditional is the part worth keeping: the rule is not "always split", it is
 * "split whenever the same migration uses the value".
 */

/**
 * Where the rendered PDF bytes live.
 *  - `spaces` → uploaded to DO Spaces, `storageRef` is the object URL.
 *  - `inline` → base64-encoded bytes stored directly in `storageRef`.
 * Phase 1 uses `inline` everywhere (DO Spaces is a Stage D activation —
 * see DEV.16); the abstraction means the Stage D switch is config, not a
 * schema change.
 */
export const generatedDocumentStorage = pgEnum('generated_document_storage', ['spaces', 'inline']);

/**
 * One immutable row per PDF render. Re-generating a document (e.g. after a
 * quotation edit) inserts a NEW row — old rows stay for audit. The download
 * path serves the most-recent row for a given `(documentType, documentId)`.
 *
 * `documentId` is a plain `text` (not a typed FK) because it points at a
 * different table depending on `documentType` (quotations, invoices, …).
 * RLS + the audit trigger apply per the standard tenant-scoped pattern.
 *
 * Cleanup: `storage = 'inline'` rows older than 30 days are pruned by the
 * daily `pdf-cleanup` cron (Day 14) — it nulls `storageRef` and stamps
 * `storageRefPurgedAt`, keeping the audit row while reclaiming the base64
 * payload. `expiresAt` lets a render opt into an explicit earlier expiry.
 */
export const generatedDocuments = pgTable(
  'generated_documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    documentType: generatedDocumentType().notNull(),
    documentId: text().notNull(),

    filename: text().notNull(),
    mimeType: text().notNull().default('application/pdf'),
    sizeBytes: integer().notNull(),

    storage: generatedDocumentStorage().notNull(),
    // Nullable: the daily pdf-cleanup cron nulls this when it purges an old
    // inline payload (the row itself is retained for audit history).
    storageRef: text(),
    storageRefPurgedAt: timestamp({ withTimezone: true }),

    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    generatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('generated_documents_tenant_doc_ix').on(t.tenantId, t.documentType, t.documentId),
    index('generated_documents_tenant_generated_ix').on(t.tenantId, t.generatedAt),
    index('generated_documents_storage_generated_ix').on(t.storage, t.generatedAt),
    check('generated_documents_size_chk', sql`${t.sizeBytes} >= 0`),
  ],
);

export type GeneratedDocument = typeof generatedDocuments.$inferSelect;
export type NewGeneratedDocument = typeof generatedDocuments.$inferInsert;
export type GeneratedDocumentType = (typeof generatedDocumentType.enumValues)[number];
export type GeneratedDocumentStorage = (typeof generatedDocumentStorage.enumValues)[number];
