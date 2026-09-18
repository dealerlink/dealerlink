import { z } from 'zod';

export const PRODUCT_STATUSES = ['active', 'inactive', 'discontinued'] as const;

/**
 * A GST rate, validated by SHAPE and not by membership (F.55, `docs/F55_SPEC.md` §1).
 *
 * This replaced `GST_RATES = [0, 5, 12, 18, 28]` and an `includes()` refine. That
 * enum was a statutory claim embedded in code, and it went stale in both
 * directions: it never carried 3% (which the DB CHECK accepted from 2026-09-07),
 * and it still carried 12% and 28% after the September 2025 rationalisation
 * removed them. A rate is TENANT DATA — the tenant classifies its own products.
 *
 * The rule is exactly the column's, and nothing stricter:
 *   - non-negative
 *   - at most two decimal places
 *   - at most 999.99, which is `numeric(5, 2)`'s own magnitude
 *
 * NO UPPER BOUND BEYOND THE COLUMN'S. `<= 100` would introduce a bound that has
 * never existed and would still miss `5` typed as `50`, the commonest slip;
 * `<= 40` is the old enum compressed into one number, going stale on the same
 * schedule. See `docs/GST_RATE_MODEL_AUDIT.md` §5.4a.
 *
 * WHY THIS LIVES IN ONE PLACE: the invariant F.55 exists to protect is
 * "code shape ⊇ DB constraint". Two copies of the rule are two things to
 * re-narrow independently, which is exactly how the 3% gap opened.
 */
export const gstRateSchema = z.coerce
  .number()
  .refine((n) => Number.isFinite(n), 'GST rate must be a number')
  .refine((n) => n >= 0, 'GST rate cannot be negative')
  .refine((n) => n <= 999.99, 'GST rate must be 999.99 or less')
  .refine(
    (n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-9,
    'GST rate must have at most 2 decimal places',
  );

const trimmed = z.string().trim();

export const productCoreSchema = z.object({
  sku: trimmed
    .min(2, 'SKU is required')
    .max(64, 'SKU must be 64 characters or fewer')
    .regex(/^\S+$/, 'SKU cannot contain whitespace'),
  name: trimmed.min(2, 'Name is required').max(255),
  description: trimmed.max(4000).optional().or(z.literal('')),
  manufacturer: trimmed.max(150).optional().or(z.literal('')),
  model: trimmed.max(150).optional().or(z.literal('')),

  hsnCode: trimmed.regex(/^[0-9]{4,8}$/, 'HSN must be 4 to 8 digits'),
  gstRate: gstRateSchema,

  category: trimmed.max(100).optional().or(z.literal('')),
  subcategory: trimmed.max(100).optional().or(z.literal('')),

  specs: z.record(z.union([z.string(), z.number(), z.boolean()])).default({}),

  mrp: z.coerce.number().nonnegative().max(99999999999).nullable().optional(),
  defaultPurchasePrice: z.coerce.number().nonnegative().max(99999999999).nullable().optional(),
  defaultSellingPrice: z.coerce.number().nonnegative().max(99999999999).nullable().optional(),

  requiresSerial: z.coerce.boolean().default(true),
  unitOfMeasure: trimmed.max(20).default('Nos'),
});

export const createProductSchema = productCoreSchema;
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productCoreSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productIdSchema = z.object({ id: z.string().uuid() });

export const productListFilterSchema = z.object({
  search: trimmed.max(200).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  category: trimmed.max(100).optional(),
  subcategory: trimmed.max(100).optional(),
  manufacturer: trimmed.max(150).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ProductListFilter = z.infer<typeof productListFilterSchema>;

export const bulkImportProductsSchema = z.object({
  rows: z.array(createProductSchema).min(1, 'At least one row is required').max(500),
});
export type BulkImportProductsInput = z.infer<typeof bulkImportProductsSchema>;
