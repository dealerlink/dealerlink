'use server';

import { paymentAllocations, payments } from '@dealerlink/db';
import {
  allocatePaymentInputSchema,
  applyAdvancePaymentInputSchema,
  deallocatePaymentInputSchema,
} from '@dealerlink/schemas';
import { Decimal, sumDecimals } from '@dealerlink/tax';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import {
  loadOrderForAllocation,
  loadPaymentLocked,
  loadPiForAllocation,
  orderAllocatedTotal,
  piAllocatedTotal,
  recomputeAffectedOrders,
  tryAutoConfirmOrder,
} from './helpers';

const ALLOCATABLE = new Set(['verified', 'cleared']);

/**
 * Allocate (part of) a payment against one or more orders / PIs (admin +
 * accounts). ATOMIC — all validation, inserts, denormalised-total update and
 * order paymentStatus recompute happen in one transaction with a `FOR UPDATE`
 * lock on the payment row, so two operators cannot both spend the same money.
 *
 * Validation:
 *   - payment is `verified` or `cleared`;
 *   - SUM(new) + payment.allocatedAmount ≤ payment.amount (no over-allocation);
 *   - each order/PI belongs to the paying dealer;
 *   - per-target: new amount ≤ (target total − already-allocated).
 *
 * When an order's paymentStatus reaches `paid` while still `pending`, the
 * funds-received-then-confirm flow reserves inventory and confirms it.
 */
export const allocatePayment = tenantAction(
  ['admin', 'accounts'],
  allocatePaymentInputSchema,
  async ({ tx, input, auth }) => {
    const payment = await loadPaymentLocked(tx, input.paymentId);
    if (!ALLOCATABLE.has(payment.status)) {
      throw new AppError(
        'VALIDATION',
        `Only verified or cleared payments can be allocated (this one is "${payment.status}")`,
      );
    }

    const amount = new Decimal(payment.amount);
    const alreadyAllocated = new Decimal(payment.allocated_amount);
    const unallocated = amount.minus(alreadyAllocated);
    const newTotal = sumDecimals(input.allocations.map((a) => new Decimal(a.amount)));
    if (newTotal.greaterThan(unallocated)) {
      throw new AppError(
        'CONFLICT',
        `Cannot allocate ₹${newTotal.toFixed(2)} — only ₹${unallocated.toFixed(2)} of this payment is unallocated`,
      );
    }

    // Per-target running totals so multiple allocations to the same order/PI
    // in one call cannot collectively over-allocate it.
    const orderRunning = new Map<string, Decimal>();
    const piRunning = new Map<string, Decimal>();
    const touchedOrderIds = new Set<string>();

    for (const a of input.allocations) {
      const amt = new Decimal(a.amount);
      if (a.orderId) {
        const order = await loadOrderForAllocation(tx, a.orderId);
        if (!order) throw new AppError('NOT_FOUND', 'Order not found');
        if (order.billToDealerId !== payment.dealer_id) {
          throw new AppError(
            'VALIDATION',
            `Order ${order.orderNumber} belongs to a different dealer than this payment`,
          );
        }
        if (order.status === 'cancelled') {
          throw new AppError('VALIDATION', `Order ${order.orderNumber} is cancelled`);
        }
        const existing = await orderAllocatedTotal(tx, a.orderId);
        const inBatch = orderRunning.get(a.orderId) ?? new Decimal(0);
        const headroom = new Decimal(order.totalAmount).minus(existing).minus(inBatch);
        if (amt.greaterThan(headroom)) {
          throw new AppError(
            'CONFLICT',
            `Cannot allocate ₹${amt.toFixed(2)} to ${order.orderNumber} — only ₹${headroom.toFixed(2)} is outstanding`,
          );
        }
        orderRunning.set(a.orderId, inBatch.plus(amt));
        touchedOrderIds.add(a.orderId);
      } else if (a.performaInvoiceId) {
        const pi = await loadPiForAllocation(tx, a.performaInvoiceId);
        if (!pi) throw new AppError('NOT_FOUND', 'Performa invoice not found');
        if (pi.billToDealerId !== payment.dealer_id) {
          throw new AppError(
            'VALIDATION',
            `PI ${pi.piNumber} belongs to a different dealer than this payment`,
          );
        }
        if (pi.status === 'cancelled') {
          throw new AppError('VALIDATION', `PI ${pi.piNumber} is cancelled`);
        }
        const existing = await piAllocatedTotal(tx, a.performaInvoiceId);
        const inBatch = piRunning.get(a.performaInvoiceId) ?? new Decimal(0);
        const headroom = new Decimal(pi.totalAmount).minus(existing).minus(inBatch);
        if (amt.greaterThan(headroom)) {
          throw new AppError(
            'CONFLICT',
            `Cannot allocate ₹${amt.toFixed(2)} to ${pi.piNumber} — only ₹${headroom.toFixed(2)} is outstanding`,
          );
        }
        piRunning.set(a.performaInvoiceId, inBatch.plus(amt));
      }
    }

    await tx.insert(paymentAllocations).values(
      input.allocations.map((a) => ({
        tenantId: payment.tenant_id,
        paymentId: payment.id,
        orderId: a.orderId ?? null,
        performaInvoiceId: a.performaInvoiceId ?? null,
        amount: new Decimal(a.amount).toFixed(2),
        allocatedBy: auth.user.id,
        notes: a.notes?.trim() || null,
      })),
    );

    await tx
      .update(payments)
      .set({
        allocatedAmount: alreadyAllocated.plus(newTotal).toFixed(2),
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(payments.id, payment.id));

    const recomputed = await recomputeAffectedOrders(tx, [...touchedOrderIds], auth.user.id);

    // Funds-received-then-confirm: an order that just became fully paid while
    // still pending is reserved + confirmed.
    const autoConfirmed: string[] = [];
    for (const r of recomputed) {
      if (r.toStatus === 'paid') {
        const res = await tryAutoConfirmOrder(tx, r.orderId, auth.user.id);
        if (res.confirmed) autoConfirmed.push(r.orderId);
      }
    }

    return {
      paymentId: payment.id,
      allocatedCount: input.allocations.length,
      newAllocatedAmount: alreadyAllocated.plus(newTotal).toFixed(2),
      ordersAutoConfirmed: autoConfirmed.length,
    };
  },
);

/**
 * Apply an advance against a PI before its order exists (admin + accounts).
 * The allocation transfers to the spawned order when the PI is confirmed
 * (see Day 11 `confirmPi`). A thin, single-target wrapper over the allocation
 * core specialised for the common advance-payment workflow.
 */
export const applyAdvancePayment = tenantAction(
  ['admin', 'accounts'],
  applyAdvancePaymentInputSchema,
  async ({ tx, input, auth }) => {
    const payment = await loadPaymentLocked(tx, input.paymentId);
    if (!ALLOCATABLE.has(payment.status)) {
      throw new AppError(
        'VALIDATION',
        `Only verified or cleared payments can be applied (this one is "${payment.status}")`,
      );
    }

    const amount = new Decimal(input.amount);
    const unallocated = new Decimal(payment.amount).minus(new Decimal(payment.allocated_amount));
    if (amount.greaterThan(unallocated)) {
      throw new AppError(
        'CONFLICT',
        `Cannot apply ₹${amount.toFixed(2)} — only ₹${unallocated.toFixed(2)} of this payment is unallocated`,
      );
    }

    const pi = await loadPiForAllocation(tx, input.piId);
    if (!pi) throw new AppError('NOT_FOUND', 'Performa invoice not found');
    if (pi.billToDealerId !== payment.dealer_id) {
      throw new AppError('VALIDATION', `PI ${pi.piNumber} belongs to a different dealer`);
    }
    if (pi.status === 'cancelled' || pi.status === 'confirmed') {
      throw new AppError(
        'VALIDATION',
        `Advances apply to draft/sent PIs only (${pi.piNumber} is "${pi.status}")`,
      );
    }
    const headroom = new Decimal(pi.totalAmount).minus(await piAllocatedTotal(tx, input.piId));
    if (amount.greaterThan(headroom)) {
      throw new AppError(
        'CONFLICT',
        `Cannot apply ₹${amount.toFixed(2)} to ${pi.piNumber} — only ₹${headroom.toFixed(2)} is outstanding`,
      );
    }

    await tx.insert(paymentAllocations).values({
      tenantId: payment.tenant_id,
      paymentId: payment.id,
      performaInvoiceId: input.piId,
      amount: amount.toFixed(2),
      allocatedBy: auth.user.id,
      notes: input.notes?.trim() || null,
    });
    await tx
      .update(payments)
      .set({
        allocatedAmount: new Decimal(payment.allocated_amount).plus(amount).toFixed(2),
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(payments.id, payment.id));

    return { paymentId: payment.id, piId: input.piId, amount: amount.toFixed(2) };
  },
);

/**
 * Remove a single allocation (admin + accounts) — used to fix mistakes. The
 * payment's denormalised total drops and the affected order's paymentStatus
 * is recomputed. Allowed only while the payment is verified/cleared; bounced
 * and refunded payments already had their allocations reversed.
 */
export const deallocatePayment = tenantAction(
  ['admin', 'accounts'],
  deallocatePaymentInputSchema,
  async ({ tx, input, auth }) => {
    const [alloc] = await tx
      .select({
        id: paymentAllocations.id,
        paymentId: paymentAllocations.paymentId,
        orderId: paymentAllocations.orderId,
        amount: paymentAllocations.amount,
      })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.id, input.allocationId))
      .limit(1);
    if (!alloc) throw new AppError('NOT_FOUND', 'Allocation not found');

    const payment = await loadPaymentLocked(tx, alloc.paymentId);
    if (!ALLOCATABLE.has(payment.status)) {
      throw new AppError(
        'VALIDATION',
        `Allocations on a "${payment.status}" payment cannot be edited`,
      );
    }

    await tx.delete(paymentAllocations).where(eq(paymentAllocations.id, input.allocationId));
    await tx
      .update(payments)
      .set({
        allocatedAmount: new Decimal(payment.allocated_amount)
          .minus(new Decimal(alloc.amount))
          .toFixed(2),
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(payments.id, payment.id));

    if (alloc.orderId) {
      await recomputeAffectedOrders(tx, [alloc.orderId], auth.user.id);
    }

    return { allocationId: input.allocationId, paymentId: payment.id };
  },
);
