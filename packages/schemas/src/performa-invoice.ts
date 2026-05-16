import { z } from 'zod';

import { quotationDiscountSchema, quotationLineInputSchema, stateCodeSchema } from './quotation';

export const PI_STATUSES = ['draft', 'sent', 'confirmed', 'cancelled'] as const;
export type PerformaInvoiceStatus = (typeof PI_STATUSES)[number];

export const PI_DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type PerformaInvoiceDiscountType = (typeof PI_DISCOUNT_TYPES)[number];

const trimmed = z.string().trim();

/** PI line input — same shape as a quotation line (snapshot of the product). */
export const piLineInputSchema = quotationLineInputSchema;
export type PiLineInput = z.infer<typeof piLineInputSchema>;

/**
 * Convert an accepted quotation into a draft PI. `shipToDealerId` defaults to
 * the quotation's dealer (Bill-To) when omitted; when it points at a dealer
 * in a different state the server recomputes tax (Ship-To drives place of
 * supply — ADR-012). `placeOfSupplyOverride` is an escape hatch for a
 * ship-to address whose state is not the dealer's registered state.
 */
export const convertQuotationToPiSchema = z.object({
  quotationId: z.string().uuid(),
  shipToDealerId: z.string().uuid().optional(),
  placeOfSupplyOverride: stateCodeSchema.optional(),
  piDate: z.string().date().optional(),
  validUntil: z.string().date(),
  discount: quotationDiscountSchema.optional(),
  termsAndConditions: trimmed.max(8000).optional().or(z.literal('')),
  notes: trimmed.max(4000).optional().or(z.literal('')),
});
export type ConvertQuotationToPiInput = z.infer<typeof convertQuotationToPiSchema>;

/** Edit a draft PI. Lines + commercials may change while status is `draft`. */
export const updatePiSchema = z
  .object({
    id: z.string().uuid(),
    shipToDealerId: z.string().uuid().optional(),
    placeOfSupplyOverride: stateCodeSchema.optional(),
    validUntil: z.string().date().optional(),
    discount: quotationDiscountSchema.optional(),
    termsAndConditions: trimmed.max(8000).nullable().optional(),
    notes: trimmed.max(4000).nullable().optional(),
    lines: z.array(piLineInputSchema).min(1, 'At least one line is required').max(50),
  })
  .superRefine((v, ctx) => {
    if (v.discount && v.discount.type === 'percent' && v.discount.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percent discount cannot exceed 100',
        path: ['discount', 'value'],
      });
    }
  });
export type UpdatePiInput = z.infer<typeof updatePiSchema>;

export const sendPiSchema = z.object({ id: z.string().uuid() });
export type SendPiInput = z.infer<typeof sendPiSchema>;

export const confirmPiSchema = z.object({ id: z.string().uuid() });
export type ConfirmPiInput = z.infer<typeof confirmPiSchema>;

export const cancelPiSchema = z.object({
  id: z.string().uuid(),
  reason: trimmed.min(2, 'A cancellation reason is required').max(500),
});
export type CancelPiInput = z.infer<typeof cancelPiSchema>;

export const piListFilterSchema = z.object({
  status: z.array(z.enum(PI_STATUSES)).optional(),
  dealerId: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  search: trimmed.max(200).optional(),
});
export type PiListFilter = z.infer<typeof piListFilterSchema>;
