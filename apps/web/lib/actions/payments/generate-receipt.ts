'use server';

import { accessLog, payments, type DrizzleTx } from '@dealerlink/db';
import { generateReceiptInputSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { spawnPdfRender } from '@/lib/pdf/spawn-render';
import {
  getGeneratedDocumentPayload,
  getLatestGeneratedDocument,
} from '@/lib/queries/generated-documents';

/** Load a payment header for guard checks (tenant scope). */
async function loadPaymentHeader(tx: DrizzleTx, id: string) {
  const [p] = await tx
    .select({ id: payments.id, tenantId: payments.tenantId, paymentNumber: payments.paymentNumber })
    .from(payments)
    .where(eq(payments.id, id))
    .limit(1);
  return p ?? null;
}

/**
 * Render (or re-render) a payment receipt to PDF via the workers subprocess
 * (DEV.36). Receipts are tax-neutral — the receipt template makes no tax
 * engine call.
 */
export const generatePaymentReceipt = tenantAction(
  ['admin', 'accounts'],
  generateReceiptInputSchema,
  async ({ tx, input, auth }) => {
    const payment = await loadPaymentHeader(tx, input.id);
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found');
    try {
      const result = await spawnPdfRender({
        documentType: 'payment_receipt',
        documentId: input.id,
        tenantId: payment.tenantId,
        userId: auth.user.id,
      });
      return {
        documentId: result.generatedDocumentId,
        filename: result.filename,
        sizeBytes: result.sizeBytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed';
      throw new AppError('INTERNAL', `Could not generate the receipt — ${message}`);
    }
  },
);

export interface PaymentReceiptDownload {
  filename: string;
  mimeType: string;
  base64: string | null;
  url: string | null;
}

/** Return the latest receipt PDF, rendering one on first request. */
export const downloadPaymentReceipt = tenantAction(
  ['admin', 'accounts'],
  generateReceiptInputSchema,
  async ({ tx, input, auth }): Promise<PaymentReceiptDownload> => {
    const payment = await loadPaymentHeader(tx, input.id);
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found');

    let generatedId = (
      await getLatestGeneratedDocument(payment.tenantId, 'payment_receipt', input.id, tx)
    )?.id;
    if (!generatedId) {
      try {
        const rendered = await spawnPdfRender({
          documentType: 'payment_receipt',
          documentId: input.id,
          tenantId: payment.tenantId,
          userId: auth.user.id,
        });
        generatedId = rendered.generatedDocumentId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'PDF generation failed';
        throw new AppError('INTERNAL', `Could not generate the receipt — ${message}`);
      }
    }

    const payload = await getGeneratedDocumentPayload(payment.tenantId, generatedId, tx);
    if (!payload) throw new AppError('NOT_FOUND', 'Generated document not found');

    await tx.insert(accessLog).values({
      tenantId: payment.tenantId,
      userId: auth.user.id,
      entityType: 'payment',
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
