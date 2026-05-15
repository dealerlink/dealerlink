/**
 * Storage abstraction for rendered PDF artifacts.
 *
 * Phase 1 stores the PDF bytes base64-encoded inside the
 * `generated_documents` row (`storage = 'inline'`) — DO Spaces is a Stage D
 * activation (DEV.16). The `uploadToSpaces` branch is the seam: when Spaces
 * credentials land, only this file changes — the schema, the render job,
 * and the download action are already storage-agnostic.
 *
 * Every render produces a NEW immutable row. Re-generating a document never
 * mutates an existing row (Day 10 guardrail).
 */
import { generatedDocuments, type DrizzleTx, type GeneratedDocumentType } from '@dealerlink/db';

export interface StorePdfInput {
  tx: DrizzleTx;
  tenantId: string;
  documentType: GeneratedDocumentType;
  /** Id of the source document (quotation id, invoice id, …). */
  documentId: string;
  filename: string;
  buffer: Buffer;
  /** Acting user id — null for system/cron renders. */
  generatedBy: string | null;
}

export interface StoredPdf {
  id: string;
  filename: string;
  sizeBytes: number;
  storage: 'spaces' | 'inline';
}

/** True when DO Spaces credentials are configured (Stage D onward). */
function spacesConfigured(): boolean {
  return Boolean(
    process.env.DO_SPACES_KEY && process.env.DO_SPACES_SECRET && process.env.DO_SPACES_BUCKET,
  );
}

/**
 * Persist a rendered PDF and return the new `generated_documents` row id.
 * Runs inside the caller's tenant transaction so RLS + the audit trigger
 * see the right tenant/user context.
 */
export async function storeRenderedPdf(input: StorePdfInput): Promise<StoredPdf> {
  const sizeBytes = input.buffer.byteLength;

  let storage: 'spaces' | 'inline';
  let storageRef: string;
  if (spacesConfigured()) {
    // Stage D: upload to DO Spaces, persist the object URL. Intentionally
    // unimplemented in Phase 1 — see DEV.16.
    storage = 'spaces';
    storageRef = await uploadToSpaces(input.filename, input.buffer);
  } else {
    storage = 'inline';
    storageRef = input.buffer.toString('base64');
  }

  const [row] = await input.tx
    .insert(generatedDocuments)
    .values({
      tenantId: input.tenantId,
      documentType: input.documentType,
      documentId: input.documentId,
      filename: input.filename,
      mimeType: 'application/pdf',
      sizeBytes,
      storage,
      storageRef,
      generatedBy: input.generatedBy,
    })
    .returning({ id: generatedDocuments.id });

  if (!row) throw new Error('storeRenderedPdf: insert returned no row');
  return { id: row.id, filename: input.filename, sizeBytes, storage };
}

/** Stage D placeholder — DO Spaces upload. Not reachable in Phase 1. */
function uploadToSpaces(_filename: string, _buffer: Buffer): Promise<string> {
  return Promise.reject(
    new Error('DO Spaces upload is a Stage D activation (DEV.16) — not implemented in Phase 1.'),
  );
}
