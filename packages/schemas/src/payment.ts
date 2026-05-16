import { z } from 'zod';

export const PAYMENT_METHODS = ['bank_transfer', 'cheque', 'cash', 'upi', 'card', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'pending_verification',
  'verified',
  'cleared',
  'bounced',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

const trimmed = z.string().trim();

/**
 * A money amount in INR. Positive, finite, at most 2 decimal places. Kept as
 * a number across the wire; the server converts to Decimal before any math
 * (Day 12 guardrail — every computation goes through decimal.js).
 */
export const moneySchema = z
  .number()
  .positive('Amount must be greater than zero')
  .finite()
  .max(99_999_999_99.99, 'Amount is implausibly large')
  .refine(
    (n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
    {
      message: 'Amount cannot have more than 2 decimal places',
    },
  );

/** Record a new payment receipt. Created in `pending_verification` status. */
export const createPaymentInputSchema = z.object({
  dealerId: z.string().uuid(),
  amount: moneySchema,
  method: z.enum(PAYMENT_METHODS),
  reference: trimmed.max(200).optional(),
  receivedDate: z.string().date(),
  depositedToBank: trimmed.max(200).optional(),
  depositedDate: z.string().date().optional(),
  notes: trimmed.max(4000).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentInputSchema>;

/** A single allocation line — exactly one of orderId / performaInvoiceId. */
export const allocationLineSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    performaInvoiceId: z.string().uuid().optional(),
    amount: moneySchema,
    notes: trimmed.max(500).optional(),
  })
  .refine((v) => Boolean(v.orderId) !== Boolean(v.performaInvoiceId), {
    message: 'Each allocation targets exactly one order or one PI',
  });
export type AllocationLineInput = z.infer<typeof allocationLineSchema>;

/** Allocate (part of) a payment against one or more orders / PIs. */
export const allocatePaymentInputSchema = z.object({
  paymentId: z.string().uuid(),
  allocations: z.array(allocationLineSchema).min(1, 'At least one allocation is required').max(50),
});
export type AllocatePaymentInput = z.infer<typeof allocatePaymentInputSchema>;

/** Apply an advance against a PI before its order exists. */
export const applyAdvancePaymentInputSchema = z.object({
  paymentId: z.string().uuid(),
  piId: z.string().uuid(),
  amount: moneySchema,
  notes: trimmed.max(500).optional(),
});
export type ApplyAdvancePaymentInput = z.infer<typeof applyAdvancePaymentInputSchema>;

/** Remove a single allocation by its id. */
export const deallocatePaymentInputSchema = z.object({
  allocationId: z.string().uuid(),
});
export type DeallocatePaymentInput = z.infer<typeof deallocatePaymentInputSchema>;

/** Just an id — for verify / mark-cleared. */
export const paymentIdSchema = z.object({ id: z.string().uuid() });
export type PaymentIdInput = z.infer<typeof paymentIdSchema>;

/** Bounce / refund a payment — both require a captured reason. */
export const transitionPaymentInputSchema = z.object({
  id: z.string().uuid(),
  reason: trimmed.min(2, 'A reason is required').max(500),
});
export type TransitionPaymentInput = z.infer<typeof transitionPaymentInputSchema>;

export const paymentListFilterSchema = z.object({
  status: z.array(z.enum(PAYMENT_STATUSES)).optional(),
  method: z.array(z.enum(PAYMENT_METHODS)).optional(),
  dealerId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  search: trimmed.max(200).optional(),
});
export type PaymentListFilter = z.infer<typeof paymentListFilterSchema>;

/** Generate / regenerate the receipt PDF for a payment. */
export const generateReceiptInputSchema = z.object({ id: z.string().uuid() });
export type GenerateReceiptInput = z.infer<typeof generateReceiptInputSchema>;
