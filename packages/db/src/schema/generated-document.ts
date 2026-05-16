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
]);

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
 * Cleanup: `storage = 'inline'` rows older than 30 days are pruned by a
 * daily cron (wired in Day 14). `expiresAt` lets a render opt into an
 * explicit earlier expiry.
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
    storageRef: text().notNull(),

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
