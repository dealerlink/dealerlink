import { z } from 'zod';

export const DISPATCH_STATUSES = ['in_transit', 'delivered', 'returned'] as const;
export type DispatchStatus = (typeof DISPATCH_STATUSES)[number];

const trimmed = z.string().trim();

/** Optional free-text logistics field — trimmed, capped, empty → undefined. */
const optionalText = (max: number) =>
  trimmed
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

/**
 * One line of a dispatch: the order line being fulfilled plus the exact
 * inventory_item serial ids picked. The count of `serialIds` must equal the
 * integer quantity — the server re-validates this with row locks.
 */
export const dispatchLineInputSchema = z.object({
  orderLineId: z.string().uuid(),
  serialIds: z
    .array(z.string().uuid())
    .min(1, 'Pick at least one serial for each dispatched line')
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'The same serial cannot be picked twice on one line',
    }),
});
export type DispatchLineInput = z.infer<typeof dispatchLineInputSchema>;

/** Create a dispatch against a confirmed (or partially-dispatched) order. */
export const createDispatchInputSchema = z.object({
  orderId: z.string().uuid(),
  lines: z.array(dispatchLineInputSchema).min(1, 'A dispatch must have at least one line'),
  dispatchDate: z.string().date().optional(),
  expectedDeliveryDate: z.string().date().optional(),
  vehicleNumber: optionalText(40),
  transporterName: optionalText(160),
  transporterDocketNumber: optionalText(80),
  driverName: optionalText(120),
  driverPhone: optionalText(20),
  ewayBillNumber: optionalText(40),
  ewayBillDate: z.string().date().optional(),
  notes: optionalText(2000),
});
export type CreateDispatchInput = z.infer<typeof createDispatchInputSchema>;

/** Mark an in-transit dispatch delivered. */
export const markDeliveredInputSchema = z.object({
  id: z.string().uuid(),
  acknowledgedBy: trimmed.min(2, 'Record who received the goods').max(160),
});
export type MarkDeliveredInput = z.infer<typeof markDeliveredInputSchema>;

/** Return an in-transit dispatch — serials go back to warehouse stock. */
export const returnDispatchInputSchema = z.object({
  id: z.string().uuid(),
  reason: trimmed.min(2, 'A return reason is required').max(500),
});
export type ReturnDispatchInput = z.infer<typeof returnDispatchInputSchema>;

/** Pick-serials helper input — used by the create-dispatch UI. */
export const pickSerialsInputSchema = z.object({
  orderId: z.string().uuid(),
});
export type PickSerialsInput = z.infer<typeof pickSerialsInputSchema>;

/** Single-id input for PDF generation / detail loads. */
export const dispatchIdInputSchema = z.object({ id: z.string().uuid() });
export type DispatchIdInput = z.infer<typeof dispatchIdInputSchema>;

export const dispatchListFilterSchema = z.object({
  status: z.array(z.enum(DISPATCH_STATUSES)).optional(),
  dealerId: z.string().uuid().optional(),
  transporter: trimmed.max(160).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  search: trimmed.max(200).optional(),
});
export type DispatchListFilter = z.infer<typeof dispatchListFilterSchema>;
