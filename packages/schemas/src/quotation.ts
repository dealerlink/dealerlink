import { z } from 'zod';

export const QUOTATION_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'superseded',
] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_DISCOUNT_TYPES = ['percent', 'amount'] as const;
export type QuotationDiscountType = (typeof QUOTATION_DISCOUNT_TYPES)[number];

export const QUOTATION_SENT_VIA = ['email', 'pdf_download', 'in_person'] as const;
export type QuotationSentVia = (typeof QUOTATION_SENT_VIA)[number];

const trimmed = z.string().trim();

/**
 * State label (Indian). Seed data uses full state names ("Maharashtra"),
 * not 2-letter codes — the tax engine just needs an exact-match string.
 * Day 9 may introduce a normalized 2-letter code; until then, accept any
 * non-empty short label.
 */
export const stateCodeSchema = trimmed.min(2, 'State is required').max(50);

/**
 * Single line input. `gstRate` is captured from product.gst_rate at the
 * moment the line is added — never recomputed at preview/save time.
 */
export const quotationLineInputSchema = z.object({
  productId: z.string().uuid(),
  productSku: trimmed.min(1).max(64),
  productName: trimmed.min(1).max(256),
  hsnCode: trimmed.regex(/^[0-9]{4,8}$/, 'HSN must be 4–8 digits'),
  quantity: z.coerce.number().positive().max(999_999),
  unitOfMeasure: trimmed.min(1).max(16).optional(),
  unitPrice: z.coerce.number().nonnegative().max(99_999_999),
  gstRate: z.coerce.number().refine((n) => [0, 5, 12, 18, 28].includes(n), {
    message: 'GST rate must be 0, 5, 12, 18, or 28',
  }),
  description: trimmed.max(500).optional().or(z.literal('')),
  notes: trimmed.max(500).optional().or(z.literal('')),
});
export type QuotationLineInput = z.infer<typeof quotationLineInputSchema>;

export const quotationDiscountSchema = z
  .object({
    type: z.enum(QUOTATION_DISCOUNT_TYPES),
    value: z.coerce.number().positive(),
  })
  .nullable();

/**
 * Create payload. Server is responsible for capturing tenantStateAtIssue
 * and (defaulting) placeOfSupply. The client passes placeOfSupply only when
 * the user explicitly overrides the dealer-default ship-to state.
 */
export const createQuotationSchema = z
  .object({
    dealerId: z.string().uuid(),
    dealId: z.string().uuid().nullable().optional(),
    preparedBy: z.string().uuid().optional(),
    quoteDate: z.string().date().optional(),
    validUntil: z.string().date(),
    placeOfSupplyOverride: stateCodeSchema.optional(),
    discount: quotationDiscountSchema.optional().default(null),
    termsAndConditions: trimmed.max(8000).optional().or(z.literal('')),
    notes: trimmed.max(4000).optional().or(z.literal('')),
    lines: z.array(quotationLineInputSchema).min(1, 'At least one line is required').max(50),
    sendOnSave: z.boolean().default(false),
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
export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = z
  .object({
    id: z.string().uuid(),
    dealerId: z.string().uuid().optional(),
    dealId: z.string().uuid().nullable().optional(),
    preparedBy: z.string().uuid().optional(),
    quoteDate: z.string().date().optional(),
    validUntil: z.string().date().optional(),
    placeOfSupplyOverride: stateCodeSchema.optional(),
    discount: quotationDiscountSchema.optional(),
    termsAndConditions: trimmed.max(8000).nullable().optional(),
    notes: trimmed.max(4000).nullable().optional(),
    lines: z.array(quotationLineInputSchema).min(1).max(50),
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
export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export const sendQuotationSchema = z.object({
  id: z.string().uuid(),
  via: z.enum(QUOTATION_SENT_VIA).default('email'),
});
export type SendQuotationInput = z.infer<typeof sendQuotationSchema>;

export const markAcceptedSchema = z.object({
  id: z.string().uuid(),
  reason: trimmed.max(500).optional().or(z.literal('')),
});

export const markRejectedSchema = z.object({
  id: z.string().uuid(),
  reason: trimmed.min(2, 'Rejection reason is required').max(500),
});

export const reviseQuotationSchema = z.object({
  id: z.string().uuid(),
});

export const deleteQuotationSchema = z.object({
  id: z.string().uuid(),
});

export const quotationListFilterSchema = z.object({
  status: z.array(z.enum(QUOTATION_STATUSES)).optional(),
  dealerId: z.string().uuid().optional(),
  preparedBy: z.string().uuid().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  search: trimmed.max(200).optional(),
  includeSuperseded: z.boolean().default(false),
});
export type QuotationListFilter = z.infer<typeof quotationListFilterSchema>;
