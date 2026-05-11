import { z } from 'zod';

export const PRODUCT_STATUSES = ['active', 'inactive', 'discontinued'] as const;
export const GST_RATES = [0, 5, 12, 18, 28] as const;

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
  gstRate: z.coerce
    .number()
    .refine(
      (n) => (GST_RATES as readonly number[]).includes(n),
      'GST rate must be one of 0/5/12/18/28',
    ),

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
