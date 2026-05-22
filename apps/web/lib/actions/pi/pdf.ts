'use server';

import { accessLog } from '@dealerlink/db';
import { z } from 'zod';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { requestPdfRender } from '@/lib/pdf/render-request';
import {
  getGeneratedDocumentPayload,
  getLatestGeneratedDocument,
} from '@/lib/queries/generated-documents';

import { loadPiForGuard } from './helpers';

const idSchema = z.object({ id: z.string().uuid() });

/** Render (or re-render) a PI to PDF via the workers subprocess (DEV.36). */
export const generatePerformaInvoicePdf = tenantAction(
  ['admin', 'sales'],
  idSchema,
  async ({ tx, input, auth }) => {
    const pi = await loadPiForGuard(tx, input.id);
    if (!pi) throw new AppError('NOT_FOUND', 'Performa invoice not found');
    try {
      const result = await requestPdfRender(tx, {
        documentType: 'performa_invoice',
        documentId: input.id,
        tenantId: pi.tenantId,
        userId: auth.user.id,
      });
      return {
        documentId: result.generatedDocumentId,
        filename: result.filename,
        sizeBytes: result.sizeBytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed';
      throw new AppError('INTERNAL', `Could not generate the PDF — ${message}`);
    }
  },
);

export interface PerformaInvoicePdfDownload {
  filename: string;
  mimeType: string;
  base64: string | null;
  url: string | null;
}

/** Return the latest PI PDF, rendering one on first request. */
export const downloadPerformaInvoicePdf = tenantAction(
  ['admin', 'sales', 'accounts'],
  idSchema,
  async ({ tx, input, auth }): Promise<PerformaInvoicePdfDownload> => {
    const pi = await loadPiForGuard(tx, input.id);
    if (!pi) throw new AppError('NOT_FOUND', 'Performa invoice not found');

    let generatedId = (
      await getLatestGeneratedDocument(pi.tenantId, 'performa_invoice', input.id, tx)
    )?.id;
    if (!generatedId) {
      try {
        const rendered = await requestPdfRender(tx, {
          documentType: 'performa_invoice',
          documentId: input.id,
          tenantId: pi.tenantId,
          userId: auth.user.id,
        });
        generatedId = rendered.generatedDocumentId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'PDF generation failed';
        throw new AppError('INTERNAL', `Could not generate the PDF — ${message}`);
      }
    }

    const payload = await getGeneratedDocumentPayload(pi.tenantId, generatedId, tx);
    if (!payload) throw new AppError('NOT_FOUND', 'Generated document not found');

    await tx.insert(accessLog).values({
      tenantId: pi.tenantId,
      userId: auth.user.id,
      entityType: 'performa_invoice',
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
