import { z } from 'zod';

import { optionalStateCodeInputSchema } from './states';

export const DEALER_TYPES = ['retailer', 'wholesaler', 'installer', 'epc', 'other'] as const;
export const DEALER_CATEGORIES = ['A', 'B', 'C'] as const;
export const DEALER_RISK_LEVELS = ['low', 'medium', 'high'] as const;
export const DEALER_STATUSES = ['active', 'inactive', 'on_hold'] as const;

const trimmed = z.string().trim();

const phoneRegex = /^\+?[0-9 ()-]{7,20}$/;
const gstinRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/;
const panRegex = /^[A-Z]{5}\d{4}[A-Z]$/;
const pincodeRegex = /^[1-9]\d{5}$/;

const optionalEmail = trimmed.toLowerCase().email().or(z.literal('')).optional();
const optionalPhone = trimmed
  .regex(phoneRegex, 'Phone must look like a phone number')
  .or(z.literal(''))
  .optional();

/** Core fields shared by dealer create + update + import. */
export const dealerCoreSchema = z.object({
  legalName: trimmed.min(2, 'Legal name is required').max(255),
  displayName: trimmed.min(2, 'Display name is required').max(150),
  contactPerson: trimmed.max(100).optional().or(z.literal('')),
  phone: optionalPhone,
  altPhone: optionalPhone,
  email: optionalEmail,
  altEmail: optionalEmail,

  addressLine1: trimmed.max(255).optional().or(z.literal('')),
  addressLine2: trimmed.max(255).optional().or(z.literal('')),
  city: trimmed.max(100).optional().or(z.literal('')),
  // ISO 3166-2:IN code (DEV.33). Lenient: the dealer dropdown submits a code,
  // but CSV import may carry a full name — both normalise to a canonical code;
  // blank/absent → undefined (persisted as NULL).
  state: optionalStateCodeInputSchema,
  pincode: trimmed
    .regex(pincodeRegex, 'Pincode must be 6 digits and not start with 0')
    .or(z.literal(''))
    .optional(),
  country: trimmed.length(2).default('IN'),

  gstin: trimmed
    .toUpperCase()
    .regex(gstinRegex, 'GSTIN format is invalid')
    .or(z.literal(''))
    .optional(),
  pan: trimmed.toUpperCase().regex(panRegex, 'PAN format is invalid').or(z.literal('')).optional(),

  type: z.enum(DEALER_TYPES).default('retailer'),
  category: z.enum(DEALER_CATEGORIES).default('B'),
  riskLevel: z.enum(DEALER_RISK_LEVELS).default('low'),

  notes: trimmed.max(4000).optional().or(z.literal('')),
  tags: z.array(trimmed.min(1).max(40)).max(20).default([]),
});

export const dealerCommercialSchema = z.object({
  creditLimit: z.coerce.number().nonnegative().max(99999999999).nullable().optional(),
  creditPeriodDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
});

/** Schema used by the new-dealer Server Action. */
export const createDealerSchema = dealerCoreSchema.merge(dealerCommercialSchema);
export type CreateDealerInput = z.infer<typeof createDealerSchema>;

/** Schema used by inline-edit of the identity/address/compliance sections. */
export const updateDealerSchema = dealerCoreSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateDealerInput = z.infer<typeof updateDealerSchema>;

/** Commercial-terms edit — admin-only at the action layer. */
export const updateDealerCommercialSchema = dealerCommercialSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateDealerCommercialInput = z.infer<typeof updateDealerCommercialSchema>;

export const deactivateDealerSchema = z.object({
  id: z.string().uuid(),
  reason: trimmed.min(2, 'Reason is required').max(500),
});

export const dealerIdSchema = z.object({ id: z.string().uuid() });

export const dealerListFilterSchema = z.object({
  search: trimmed.max(200).optional(),
  status: z.enum(DEALER_STATUSES).optional(),
  type: z.enum(DEALER_TYPES).optional(),
  category: z.enum(DEALER_CATEGORIES).optional(),
  riskLevel: z.enum(DEALER_RISK_LEVELS).optional(),
  // Accept a code or a name in the URL; normalise to a code to match storage.
  state: optionalStateCodeInputSchema,
  tag: trimmed.max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type DealerListFilter = z.infer<typeof dealerListFilterSchema>;
/**
 * Pre-parse INPUT shape of the filter — `state` accepts a raw code-or-name
 * string here (the schema transforms it to a canonical code on parse), unlike
 * the post-parse {@link DealerListFilter} where `state` is already a code.
 * Callers that forward untrusted query params should accept this type.
 */
export type DealerListFilterInput = z.input<typeof dealerListFilterSchema>;

/** Row shape for bulk-import CSV — every value comes in as a string. */
export const dealerImportRowSchema = createDealerSchema.extend({
  // CSV fields are strings; let the same validators handle them via merging
});

export const bulkImportDealersSchema = z.object({
  rows: z.array(createDealerSchema).min(1, 'At least one row is required').max(500),
});
export type BulkImportDealersInput = z.infer<typeof bulkImportDealersSchema>;
