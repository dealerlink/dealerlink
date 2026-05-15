'use server';

import { accessLog } from '@dealerlink/db';
import { z } from 'zod';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import {
  getGeneratedDocumentPayload,
  getLatestGeneratedDocument,
} from '@/lib/queries/generated-documents';
import { spawnPdfRender } from '@/lib/pdf/spawn-render';

import { loadQuotationForGuard } from './helpers';

const downloadPdfSchema = z.object({ id: z.string().uuid() });

export interface QuotationPdfDownload {
  filename: string;
  mimeType: string;
  /** Base64 PDF bytes — set when storage is 'inline' (Phase 1, DEV.16). */
  base64: string | null;
  /** Object URL — set when storage is 'spaces' (Stage D). */
  url: string | null;
}

/**
 * Return the latest PDF for a quotation, generating one on first request.
 *
 * Accounts can download (read-only access to the document) but not
 * generate from scratch in the UI; this action quietly renders one if none
 * exists yet so the download never dead-ends. Each download is recorded in
 * `access_log` (action = 'download').
 */
export const downloadQuotationPdf = tenantAction(
  ['admin', 'sales', 'accounts'],
  downloadPdfSchema,
  async ({ tx, input, auth }): Promise<QuotationPdfDownload> => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');

    let generatedId = (
      await getLatestGeneratedDocument(existing.tenantId, 'quotation', input.id, tx)
    )?.id;

    if (!generatedId) {
      const rendered = await spawnPdfRender({
        documentType: 'quotation',
        documentId: input.id,
        tenantId: existing.tenantId,
        userId: auth.user.id,
      });
      generatedId = rendered.generatedDocumentId;
    }

    const payload = await getGeneratedDocumentPayload(existing.tenantId, generatedId, tx);
    if (!payload) throw new AppError('NOT_FOUND', 'Generated document not found');

    await tx.insert(accessLog).values({
      tenantId: existing.tenantId,
      userId: auth.user.id,
      entityType: 'quotation',
      entityId: input.id,
      action: 'download',
    });

    return {
      filename: payload.filename,
      mimeType: payload.mimeType,
      base64: payload.storage === 'inline' ? payload.storageRef : null,
      url: payload.storage === 'spaces' ? payload.storageRef : null,
    };
  },
);
