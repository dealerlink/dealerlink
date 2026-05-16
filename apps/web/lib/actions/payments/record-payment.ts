'use server';

import { payments } from '@dealerlink/db';
import { createPaymentInputSchema } from '@dealerlink/schemas';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import { allocatePaymentNumber, fiscalYear, loadPayerDealer } from './helpers';

/**
 * Record a new payment receipt (admin + accounts — sales may not touch
 * money). The payment lands in `pending_verification`; allocations are only
 * possible once an accountant verifies it.
 */
export const recordPayment = tenantAction(
  ['admin', 'accounts'],
  createPaymentInputSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    await loadPayerDealer(tx, input.dealerId);

    const paymentNumber = await allocatePaymentNumber(tx, tenantId, fiscalYear());

    const [created] = await tx
      .insert(payments)
      .values({
        tenantId,
        paymentNumber,
        dealerId: input.dealerId,
        amount: input.amount.toFixed(2),
        currency: 'INR',
        method: input.method,
        reference: input.reference?.trim() || null,
        receivedDate: input.receivedDate,
        depositedToBank: input.depositedToBank?.trim() || null,
        depositedDate: input.depositedDate ?? null,
        status: 'pending_verification',
        allocatedAmount: '0',
        notes: input.notes?.trim() || null,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: payments.id, paymentNumber: payments.paymentNumber });
    if (!created) throw new AppError('INTERNAL', 'Failed to record the payment');

    return { id: created.id, paymentNumber: created.paymentNumber };
  },
);
