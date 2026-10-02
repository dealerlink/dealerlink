import { documentCounters, nextCounter, tenantSettings, type DrizzleTx } from '@dealerlink/db';
import { eq } from 'drizzle-orm';

import { fiscalYear } from '../quotations/fiscal-year';

export { fiscalYear };

/**
 * Document-number allocation for the tax invoice, credit note and debit note.
 *
 * ## NO MIGRATION IS NEEDED, AND THAT WAS CONFIRMED RATHER THAN INHERITED
 *
 * `document_counters.docType` is free-text `text()` and the unique index is
 * `(tenant_id, doc_type, fiscal_year)` — `packages/db/src/schema/document-counter.ts`,
 * read in full. `nextCounter` is a single atomic
 * `INSERT … ON CONFLICT DO UPDATE SET last_value = last_value + 1`, so a new series
 * is a new `docType` STRING and nothing else. Three new series, zero schema change.
 *
 * Separate counters per document type is not a preference: GST requires distinct
 * series per document type, and a shared counter would make `INV-2026-0007` and
 * `CN-2026-0007` mutually exclusive.
 *
 * ## THE PREFIX COMES FROM A FALLBACK, AND THE REASON IS A DATA-LOSS PATH (F6 D-7)
 *
 * `prefixes['x'] ?? '…'` — the pattern `allocatePaymentNumber` already uses. **None
 * of the three hardcoded prefix lists is touched**: not `docPrefixesSchema`
 * (`apps/web/lib/admin/schemas.ts`), not the JSONB default
 * (`packages/db/src/schema/tenant-settings.ts`), not the admin form's `keys` array.
 *
 * Why that matters rather than being tidiness: `updateTenantDocPrefixes` replaces
 * the **whole** `doc_prefixes` JSONB with its parsed input, and `docPrefixesSchema`
 * is a closed `z.object`, so **Zod strips any key the schema does not declare**. A
 * key added to the database default without also being added to the schema is
 * therefore DELETED on the first operator save — silently, with no error, and no
 * test covers it. The deleted key would be a tenant's document-numbering prefix.
 * Filed as **F.163**; operator-configurable note prefixes are **F.164**, explicitly
 * scheduled after it.
 *
 * `invoice` is the exception and needs no fallback in practice — it is already a
 * required key in `docPrefixesSchema` and already renders an editable "Tax invoice"
 * input in the admin UI, for a document that until now could not be created. The
 * fallback is still written for it, because a tenant row whose JSONB predates that
 * key would otherwise produce `undefined-2026-0001`.
 */
async function allocate(
  tx: DrizzleTx,
  tenantId: string,
  docType: 'invoice' | 'credit_note' | 'debit_note',
  fallbackPrefix: string,
  at: Date = new Date(),
): Promise<string> {
  const fy = fiscalYear(at);
  const [s] = await tx
    .select({ docPrefixes: tenantSettings.docPrefixes })
    .from(tenantSettings)
    .where(eq(tenantSettings.tenantId, tenantId))
    .limit(1);
  const prefixes = (s?.docPrefixes ?? {}) as Record<string, string>;
  const prefix = prefixes[docType] ?? fallbackPrefix;
  const seq = await nextCounter(tx, tenantId, docType, fy);
  return `${prefix}-${fy}-${String(seq).padStart(4, '0')}`;
}

/** `INV-2026-0001`. The prefix is operator-configurable today. */
export function allocateInvoiceNumber(tx: DrizzleTx, tenantId: string, at?: Date) {
  return allocate(tx, tenantId, 'invoice', 'INV', at);
}

/** `CN-2026-0001`. Prefix not yet configurable — F.164, after F.163. */
export function allocateCreditNoteNumber(tx: DrizzleTx, tenantId: string, at?: Date) {
  return allocate(tx, tenantId, 'credit_note', 'CN', at);
}

/** `DN-2026-0001`. Prefix not yet configurable — F.164, after F.163. */
export function allocateDebitNoteNumber(tx: DrizzleTx, tenantId: string, at?: Date) {
  return allocate(tx, tenantId, 'debit_note', 'DN', at);
}

/** The three series this module owns, for tests that enumerate rather than count. */
export const INVOICE_DOC_TYPES = ['invoice', 'credit_note', 'debit_note'] as const;

/** Re-exported so a test can assert on the counter rows without importing the schema. */
export { documentCounters };
