'use server';

import { dealers, emailDeliveryLog, payments } from '@dealerlink/db';
import { generateReceiptInputSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { spawnPdfRender } from '@/lib/pdf/spawn-render';

/**
 * Email a payment receipt to the paying dealer (admin + accounts). The
 * receipt PDF is rendered if needed, then a `queued` email-delivery row is
 * written for Day 14's Resend worker to pick up. The receipt goes to the
 * Bill-To dealer — the payer (CLAUDE.md §6).
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

    // Render the receipt PDF best-effort so the document is ready when the
    // email worker sends. A render failure must not block the queue row.
    try {
      await spawnPdfRender({
        documentType: 'payment_receipt',
        documentId: input.id,
        tenantId: payment.tenantId,
        userId: auth.user.id,
      });
    } catch {
      // Swallowed by design — the email worker re-renders if needed.
    }

    await tx.insert(emailDeliveryLog).values({
      tenantId: payment.tenantId,
      recipient: dealer.email,
      subject: `Payment Receipt ${payment.paymentNumber}`,
      template: 'payment-receipt-pdf',
      status: 'queued',
      meta: { paymentId: payment.id, paymentNumber: payment.paymentNumber, pendingSend: true },
    });

    return { id: input.id, queuedTo: dealer.email };
  },
);
