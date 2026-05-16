'use server';

import {
  DealInvalidTransitionError,
  HighRiskGuardError,
  dealers,
  emailDeliveryLog,
  orderLines,
  orders,
  performaInvoiceLines,
  transitionDealStageDb,
  transitionPi,
} from '@dealerlink/db';
import { cancelPiSchema, confirmPiSchema, sendPiSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { spawnPdfRender } from '@/lib/pdf/spawn-render';

import {
  allocateDocumentNumber,
  fiscalYear,
  loadPiForGuard,
  loadTenantPiContext,
  writeOrderStatusHistory,
} from './helpers';

/**
 * Send a draft PI to the buyer: draft → sent. Records a queued email-delivery
 * row for the Bill-To dealer (the Resend send lands Day 14, R.13). The PI
 * PDF is rendered on send by chunk 11c's wiring.
 */
export const sendPi = tenantAction(
  ['admin', 'sales'],
  sendPiSchema,
  async ({ tx, input, auth }) => {
    const pi = await loadPiForGuard(tx, input.id);
    if (!pi) throw new AppError('NOT_FOUND', 'Performa invoice not found');
    if (auth.user.role === 'sales' && pi.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only send PIs you prepared');
    }
    if (pi.status !== 'draft') {
      throw new AppError('VALIDATION', `Cannot send a PI in "${pi.status}" status`);
    }

    await transitionPi(tx, input.id, 'sent', { userId: auth.user.id, reason: 'sent_to_buyer' });

    // Render the PDF on the draft → sent transition so the document is ready
    // immediately. Best-effort — a render failure must not roll back the
    // (successful) status change; the user can re-generate from the PI page.
    try {
      await spawnPdfRender({
        documentType: 'performa_invoice',
        documentId: input.id,
        tenantId: pi.tenantId,
        userId: auth.user.id,
      });
    } catch {
      // Swallowed by design — see comment above.
    }

    // Log the (queued) delivery so Day 14's email worker can pick it up.
    const [billTo] = await tx
      .select({ email: dealers.email })
      .from(dealers)
      .where(eq(dealers.id, pi.billToDealerId))
      .limit(1);
    if (billTo?.email) {
      await tx.insert(emailDeliveryLog).values({
        tenantId: pi.tenantId,
        recipient: billTo.email,
        subject: `Performa Invoice ${pi.piNumber}`,
        template: 'performa-invoice-pdf',
        status: 'queued',
        meta: { performaInvoiceId: pi.id, piNumber: pi.piNumber, pendingSend: true },
      });
    }

    return { id: input.id, status: 'sent' as const };
  },
);

/**
 * Confirm a sent PI — the buyer has agreed. THE most choreographed action in
 * the build so far. In a single transaction it:
 *   1. transitions the PI sent → confirmed (immutable thereafter);
 *   2. allocates an order number and inserts the Order (status `pending`);
 *   3. copies PI lines 1:1 into order_lines;
 *   4. advances the linked deal po_pending → payment_pending;
 *   5. writes status-history rows for each step.
 * Any failure rolls the whole thing back.
 */
export const confirmPi = tenantAction(
  ['admin', 'sales'],
  confirmPiSchema,
  async ({ tx, input, auth }) => {
    const guard = await loadPiForGuard(tx, input.id);
    if (!guard) throw new AppError('NOT_FOUND', 'Performa invoice not found');
    if (auth.user.role === 'sales' && guard.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only confirm PIs you prepared');
    }

    // transitionPi locks the row and enforces sent → confirmed.
    const pi = await transitionPi(tx, input.id, 'confirmed', {
      userId: auth.user.id,
      reason: 'confirmed_buyer_agreed',
    });

    const tenantId = pi.tenantId;
    const tenantCtx = await loadTenantPiContext(tx, tenantId);
    const orderNumber = await allocateDocumentNumber(
      tx,
      tenantId,
      'order',
      tenantCtx.orderPrefix,
      fiscalYear(),
    );

    const now = new Date();
    const [order] = await tx
      .insert(orders)
      .values({
        tenantId,
        orderNumber,
        performaInvoiceId: pi.id,
        quotationId: pi.quotationId,
        dealId: pi.dealId,
        billToDealerId: pi.billToDealerId,
        shipToDealerId: pi.shipToDealerId,
        tenantStateAtIssue: pi.tenantStateAtIssue,
        placeOfSupply: pi.placeOfSupply,
        orderDate: now.toISOString().slice(0, 10),
        currency: pi.currency,
        subtotal: pi.subtotal,
        discountAmount: pi.discountAmount,
        taxableAmount: pi.taxableAmount,
        cgstAmount: pi.cgstAmount,
        sgstAmount: pi.sgstAmount,
        igstAmount: pi.igstAmount,
        totalAmount: pi.totalAmount,
        status: 'pending',
        paymentStatus: 'unpaid',
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: orders.id, orderNumber: orders.orderNumber });
    if (!order) throw new AppError('INTERNAL', 'Failed to create the order');

    const piLines = await tx
      .select()
      .from(performaInvoiceLines)
      .where(eq(performaInvoiceLines.performaInvoiceId, pi.id));
    piLines.sort((a, b) => a.lineNumber - b.lineNumber);
    if (piLines.length > 0) {
      await tx.insert(orderLines).values(
        piLines.map((l) => ({
          tenantId,
          orderId: order.id,
          lineNumber: l.lineNumber,
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate,
          lineTotal: l.lineTotal,
          description: l.description,
          notes: l.notes,
        })),
      );
    }

    await writeOrderStatusHistory(tx, {
      tenantId,
      orderId: order.id,
      fromStatus: null,
      toStatus: 'pending',
      actorId: auth.user.id,
      reason: `created_from_${pi.piNumber}`,
    });

    // Pipeline: advance the deal po_pending → payment_pending. A deal sitting
    // in another stage (or a high-risk guard) is not an error here — the PI
    // confirmation stands. Any OTHER failure rolls the whole txn back.
    if (pi.dealId) {
      try {
        await transitionDealStageDb(tx, pi.dealId, 'payment_pending', {
          role: auth.user.role === 'admin' ? 'admin' : 'sales',
          userId: auth.user.id,
          automatic: true,
          reason: `order ${orderNumber} created`,
        });
      } catch (err) {
        if (!(err instanceof DealInvalidTransitionError) && !(err instanceof HighRiskGuardError)) {
          throw err;
        }
      }
    }

    return { id: pi.id, status: 'confirmed' as const, orderId: order.id, orderNumber };
  },
);

/** Cancel a PI (admin only) with a captured reason. Draft or sent → cancelled. */
export const cancelPi = tenantAction(['admin'], cancelPiSchema, async ({ tx, input, auth }) => {
  const pi = await loadPiForGuard(tx, input.id);
  if (!pi) throw new AppError('NOT_FOUND', 'Performa invoice not found');
  if (pi.status === 'confirmed') {
    throw new AppError(
      'VALIDATION',
      'A confirmed PI cannot be cancelled — cancel the order instead',
    );
  }
  if (pi.status === 'cancelled') {
    throw new AppError('VALIDATION', 'This PI is already cancelled');
  }

  await transitionPi(tx, input.id, 'cancelled', {
    userId: auth.user.id,
    reason: input.reason,
  });

  return { id: input.id, status: 'cancelled' as const };
});
