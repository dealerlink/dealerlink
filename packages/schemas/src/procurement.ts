import { z } from 'zod';

const trimmed = z.string().trim();

export const procurementStatuses = ['draft', 'confirmed', 'received'] as const;
export type ProcurementStatus = (typeof procurementStatuses)[number];

export const procurementLineInputSchema = z.object({
  productId: z.string().uuid('Pick a product'),
  quantity: z.coerce.number().int().positive().max(10000),
  unitPrice: z.coerce.number().nonnegative().max(99999999),
});
export type ProcurementLineInput = z.infer<typeof procurementLineInputSchema>;

export const createProcurementSchema = z.object({
  procurementDate: trimmed.regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  supplierName: trimmed.min(2, 'Supplier name is required').max(200),
  invoiceNumber: trimmed.max(100).optional().or(z.literal('')),
  invoiceDate: trimmed
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  invoiceAttachmentUrl: trimmed.max(2000).optional().or(z.literal('')),
  notes: trimmed.max(2000).optional().or(z.literal('')),
  lines: z.array(procurementLineInputSchema).min(1, 'At least one line is required'),
});
export type CreateProcurementInput = z.infer<typeof createProcurementSchema>;

export const updateProcurementHeaderSchema = createProcurementSchema
  .omit({ lines: true })
  .extend({ id: z.string().uuid() });
export type UpdateProcurementHeaderInput = z.infer<typeof updateProcurementHeaderSchema>;

export const addProcurementLineSchema = z.object({
  procurementId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().max(10000),
  unitPrice: z.coerce.number().nonnegative().max(99999999),
});
export type AddProcurementLineInput = z.infer<typeof addProcurementLineSchema>;

export const updateProcurementLineSchema = z.object({
  id: z.string().uuid(),
  quantity: z.coerce.number().int().positive().max(10000),
  unitPrice: z.coerce.number().nonnegative().max(99999999),
});
export type UpdateProcurementLineInput = z.infer<typeof updateProcurementLineSchema>;

export const submitSerialsSchema = z.object({
  procurementId: z.string().uuid(),
  productId: z.string().uuid(),
  serials: z.array(trimmed.min(1).max(100)).min(1).max(1000),
});
export type SubmitSerialsInput = z.infer<typeof submitSerialsSchema>;

export const inventoryStatuses = [
  'in_stock',
  'reserved',
  'dispatched',
  'delivered',
  'returned',
  'damaged',
  'lost',
] as const;
export type InventoryStatusName = (typeof inventoryStatuses)[number];

export const inventoryListFilterSchema = z.object({
  search: trimmed.optional(),
  status: z.enum(inventoryStatuses).optional(),
  productId: z.string().uuid().optional(),
  warehouseCode: trimmed.optional(),
  procurementId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(1000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type InventoryListFilter = z.infer<typeof inventoryListFilterSchema>;

export const transitionItemSchema = z.object({
  id: z.string().uuid(),
  target: z.enum(inventoryStatuses),
  notes: trimmed.max(500).optional(),
});
export type TransitionItemInput = z.infer<typeof transitionItemSchema>;
