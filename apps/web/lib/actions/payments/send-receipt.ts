'use server';

import { dealers, payments, tenants } from '@dealerlink/db';
import { generateReceiptInputSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { queueEmail } from '@/lib/email/send';
import { renderDocumentEmail } from '@/lib/email/templates/document-delivery';
import { AppError } from '@/lib/errors';
import { spawnPdfRender } from '@/lib/pdf/spawn-render';

/**
 * Email a payment receipt to the paying dealer (admin + accounts).
 *
 * The receipt PDF is rendered, then `queueEmail` records a `queued`
 * email_delivery_log row and enqueues the pg-boss `send-email` job (R.13 —
 * async). The receipt goes to the Bill-To dealer — the payer (CLAUDE.md §6).
 */
export const sendPaymentReceipt = tenantAction(
  ['admin', 'accounts'],
  generateReceiptInputSchema,
  async ({ tx, input, auth }) => {
    const [payment] = await tx
      .select({
        id: payments.id,
        tenantId: payments.tenantId,
        paymentNumber: payments.paymentNumber,
        dealerId: payments.dealerId,
      })
      .from(payments)
      .where(eq(payments.id, input.id))
      .limit(1);
    if (!payment) throw new AppError('NOT_FOUND', 'Payment not found');

    const [dealer] = await tx
      .select({ email: dealers.email, name: dealers.displayName })
      .from(dealers)
      .where(eq(dealers.id, payment.dealerId))
      .limit(1);
    if (!dealer?.email) {
      throw new AppError(
        'VALIDATION',
        'The dealer has no email address on file — add one to send the receipt',
      );
    }

    // Render the receipt PDF. Best-effort — a render failure must not block
    // the email; the worker simply sends without the attachment.
    let receiptDocId: string | null = null;
    try {
      const rendered = await spawnPdfRender({
        documentType: 'payment_receipt',
        documentId: input.id,
        tenantId: payment.tenantId,
        userId: auth.user.id,
      });
      receiptDocId = rendered.generatedDocumentId;
    } catch {
      // Swallowed by design — see comment above.
    }

    const [tenant] = await tx
      .select({ displayName: tenants.displayName })
      .from(tenants)
      .where(eq(tenants.id, payment.tenantId))
      .limit(1);
    const { html, text } = renderDocumentEmail({
      documentTitle: `Payment Receipt ${payment.paymentNumber}`,
      senderName: tenant?.displayName ?? 'Dealerlink',
      intro: `Please find payment receipt ${payment.paymentNumber} attached as a PDF.`,
    });

    const { emailLogId } = await queueEmail(tx, {
      tenantId: payment.tenantId,
      to: dealer.email,
      subject: `Payment Receipt ${payment.paymentNumber}`,
      html,
      text,
      template: 'payment-receipt-pdf',
      ...(receiptDocId ? { attachmentDocumentIds: [receiptDocId] } : {}),
      extraMeta: { paymentId: payment.id, paymentNumber: payment.paymentNumber },
    });

    return { id: input.id, emailLogId, queuedTo: dealer.email };
  },
);
