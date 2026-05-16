import { z } from 'zod';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'partially_dispatched',
  'fully_dispatched',
  'delivered',
  'closed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_PAYMENT_STATUSES = ['unpaid', 'partially_paid', 'paid'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

const trimmed = z.string().trim();

/** Confirm a pending order — reserves inventory (FIFO) for every line. */
export const confirmOrderSchema = z.object({ id: z.string().uuid() });
export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;

export const updateOrderExpectedDispatchSchema = z.object({
  id: z.string().uuid(),
  expectedDispatchDate: z.string().date().nullable(),
});
export type UpdateOrderExpectedDispatchInput = z.infer<typeof updateOrderExpectedDispatchSchema>;

export const cancelOrderSchema = z.object({
  id: z.string().uuid(),
  reason: trimmed.min(2, 'A cancellation reason is required').max(500),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const orderListFilterSchema = z.object({
  status: z.array(z.enum(ORDER_STATUSES)).optional(),
  paymentStatus: z.array(z.enum(ORDER_PAYMENT_STATUSES)).optional(),
  dealerId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  search: trimmed.max(200).optional(),
});
export type OrderListFilter = z.infer<typeof orderListFilterSchema>;
