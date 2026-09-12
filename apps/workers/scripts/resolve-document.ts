/**
 * Resolve a document by `(tenant slug, document number)` — the addressing both
 * the reference capture and the Typst render use.
 *
 * WHY THIS EXISTS, and why neither script may go back to ids: `pnpm db:seed`
 * truncates and re-inserts, so every id in the database — tenant ids included —
 * is new on each seed. Day 25's capture manifests named documents by uuid, and
 * by Day 26 every one of them resolved to "not found" (DEV.119). Document
 * numbers and every rendered value are stable across a reseed; ids are not.
 *
 * Shared rather than copied so the capture side and the render side cannot
 * drift into addressing the same document two different ways — which is how a
 * reference and its render end up being of two different documents.
 */
import { adminDb } from '@dealerlink/db';
import { sql } from 'drizzle-orm';

export type Kind = 'quotation' | 'performa_invoice' | 'payment_receipt' | 'dispatch';

export interface DocumentCase {
  label: string;
  type: Kind;
  tenantSlug: string;
  documentNumber: string;
  /** Render with the branded-tenant fixture's logo. */
  branded?: boolean;
  covers?: string[];
}

/** Table each document type lives in. */
export const SOURCE_TABLE: Record<Kind, string> = {
  quotation: 'quotations',
  performa_invoice: 'performa_invoices',
  payment_receipt: 'payments',
  dispatch: 'dispatches',
};

/** Column holding the human document number, per type. */
const NUMBER_COLUMN: Record<Kind, string> = {
  quotation: 'quote_number',
  performa_invoice: 'pi_number',
  payment_receipt: 'payment_number',
  dispatch: 'dispatch_number',
};

/**
 * Quotations are the one type whose number is not unique: the seed builds a
 * revision chain, so QT-2026-0010 exists three times (revisions 1 and 2
 * superseded, 3 draft). The Day 25 reference renders "QUOTATION REV 3", so the
 * highest revision is the right row — and choosing it explicitly is what stops
 * a future reseed silently diffing against revision 1. Any other type resolving
 * to more than one row raises rather than picking one.
 */
export async function resolveDocument(
  c: Pick<DocumentCase, 'type' | 'tenantSlug' | 'documentNumber'>,
): Promise<{ tenantId: string; documentId: string }> {
  const table = SOURCE_TABLE[c.type];
  const col = NUMBER_COLUMN[c.type];
  const order = c.type === 'quotation' ? sql.raw('order by d.revision desc') : sql.raw('');
  const rows = (await adminDb.execute(sql`
    select d.id::text as document_id, d.tenant_id::text as tenant_id
    from ${sql.raw(table)} d
    join tenants t on t.id = d.tenant_id
    where t.slug = ${c.tenantSlug} and d.${sql.raw(col)} = ${c.documentNumber}
    ${order}
  `)) as Array<{ document_id: string; tenant_id: string }>;

  if (rows.length === 0) {
    throw new Error(
      `no ${c.type} ${c.documentNumber} for tenant '${c.tenantSlug}' — has the database been seeded?`,
    );
  }
  if (rows.length > 1 && c.type !== 'quotation') {
    throw new Error(`${rows.length} rows for ${c.type} ${c.documentNumber} — ambiguous`);
  }
  return { tenantId: rows[0]!.tenant_id, documentId: rows[0]!.document_id };
}
