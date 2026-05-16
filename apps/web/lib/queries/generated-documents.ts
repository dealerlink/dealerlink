import {
  generatedDocuments,
  withTenant,
  type GeneratedDocumentType,
  type DrizzleTx,
} from '@dealerlink/db';
import { and, desc, eq } from 'drizzle-orm';

export interface GeneratedDocumentSummary {
  id: string;
  filename: string;
  sizeBytes: number;
  storage: 'spaces' | 'inline';
  generatedAt: Date;
}

export interface GeneratedDocumentPayload extends GeneratedDocumentSummary {
  mimeType: string;
  /** Null when the daily pdf-cleanup cron has purged the inline payload. */
  storageRef: string | null;
}

/** Latest render for a document, or null if it has never been generated. */
export async function getLatestGeneratedDocument(
  tenantId: string,
  documentType: GeneratedDocumentType,
  documentId: string,
  tx?: DrizzleTx,
): Promise<GeneratedDocumentSummary | null> {
  const run = async (t: DrizzleTx): Promise<GeneratedDocumentSummary | null> => {
    const [row] = await t
      .select({
        id: generatedDocuments.id,
        filename: generatedDocuments.filename,
        sizeBytes: generatedDocuments.sizeBytes,
        storage: generatedDocuments.storage,
        generatedAt: generatedDocuments.generatedAt,
      })
      .from(generatedDocuments)
      .where(
        and(
          eq(generatedDocuments.tenantId, tenantId),
          eq(generatedDocuments.documentType, documentType),
          eq(generatedDocuments.documentId, documentId),
        ),
      )
      .orderBy(desc(generatedDocuments.generatedAt))
      .limit(1);
    return row ?? null;
  };
  return tx ? run(tx) : withTenant(tenantId, run);
}

/** Full payload (incl. storageRef) for one generated document row. */
export async function getGeneratedDocumentPayload(
  tenantId: string,
  id: string,
  tx?: DrizzleTx,
): Promise<GeneratedDocumentPayload | null> {
  const run = async (t: DrizzleTx): Promise<GeneratedDocumentPayload | null> => {
    const [row] = await t
      .select({
        id: generatedDocuments.id,
        filename: generatedDocuments.filename,
        sizeBytes: generatedDocuments.sizeBytes,
        storage: generatedDocuments.storage,
        generatedAt: generatedDocuments.generatedAt,
        mimeType: generatedDocuments.mimeType,
        storageRef: generatedDocuments.storageRef,
      })
      .from(generatedDocuments)
      .where(and(eq(generatedDocuments.tenantId, tenantId), eq(generatedDocuments.id, id)))
      .limit(1);
    return row ?? null;
  };
  return tx ? run(tx) : withTenant(tenantId, run);
}
