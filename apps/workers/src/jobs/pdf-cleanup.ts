/**
 * `pdf-cleanup` — daily prune of stale inline PDF payloads.
 *
 * Day 10 stores rendered PDFs as base64 inside `generated_documents.storage_ref`
 * (DEV.16). Those payloads accumulate. This job purges the base64 for inline
 * rows older than 30 days: `storage_ref` is nulled and `storage_ref_purged_at`
 * is stamped. The row itself is KEPT — the audit history of "this document was
 * generated" survives; only the (re-generatable) bytes are reclaimed.
 *
 * Scheduled at 03:00 IST (see src/index.ts). Idempotent — a purged row no
 * longer matches (`storage_ref IS NOT NULL` guard).
 */
import { adminDb, generatedDocuments } from '@dealerlink/db';
import { and, eq, isNotNull, lt } from 'drizzle-orm';

import { logger } from '../observability/logger';

/** Inline payloads older than this are purged. */
export const PDF_RETENTION_DAYS = 30;

export interface PdfCleanupResult {
  cutoff: string;
  purged: number;
}

export async function runPdfCleanup(asOf: Date = new Date()): Promise<PdfCleanupResult> {
  const cutoff = new Date(asOf.getTime() - PDF_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const purged = await adminDb
    .update(generatedDocuments)
    .set({ storageRef: null, storageRefPurgedAt: asOf })
    .where(
      and(
        eq(generatedDocuments.storage, 'inline'),
        isNotNull(generatedDocuments.storageRef),
        lt(generatedDocuments.generatedAt, cutoff),
      ),
    )
    .returning({ id: generatedDocuments.id });

  const result: PdfCleanupResult = { cutoff: cutoff.toISOString(), purged: purged.length };
  logger.info({ job: 'pdf-cleanup', ...result }, 'pdf-cleanup sweep complete');
  return result;
}
