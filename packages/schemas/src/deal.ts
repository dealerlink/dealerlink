import { z } from 'zod';

export const DEAL_STAGES = [
  'qualification',
  'needs_analysis',
  'quotation_sent',
  'negotiation',
  'verbal_commit',
  'po_pending',
  'payment_pending',
  'ready_for_dispatch',
  'closed',
] as const;

export const DEAL_STATUSES = ['open', 'won', 'lost'] as const;

export const DEAL_SOURCES = [
  'inbound',
  'outbound',
  'referral',
  'repeat_business',
  'other',
] as const;

export const DEAL_LOST_REASONS = ['price', 'competitor', 'timing', 'no_budget', 'other'] as const;

const trimmed = z.string().trim();

export const dealProductInputSchema = z.object({
  productId: z.string().uuid(),
  estimatedQuantity: z.coerce.number().int().positive().max(100000).default(1),
  notes: trimmed.max(500).optional().or(z.literal('')),
});

export const createDealSchema = z.object({
  title: trimmed.min(2, 'Title is required').max(200),
  dealerId: z.string().uuid(),
  assignedTo: z.string().uuid().optional(),
  estimatedValue: z.coerce.number().nonnegative().max(99999999999).nullable().optional(),
  probabilityPercent: z.coerce.number().int().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  source: z.enum(DEAL_SOURCES).default('outbound'),
  notes: trimmed.max(4000).optional().or(z.literal('')),
  hot: z.boolean().default(false),
  products: z.array(dealProductInputSchema).max(20).default([]),
});
export type CreateDealInput = z.infer<typeof createDealSchema>;

export const updateDealMetadataSchema = z.object({
  id: z.string().uuid(),
  title: trimmed.min(2).max(200).optional(),
  estimatedValue: z.coerce.number().nonnegative().max(99999999999).nullable().optional(),
  probabilityPercent: z.coerce.number().int().min(0).max(100).nullable().optional(),
  expectedCloseDate: z.string().date().nullable().optional(),
  source: z.enum(DEAL_SOURCES).optional(),
  notes: trimmed.max(4000).nullable().optional(),
  hot: z.boolean().optional(),
});
export type UpdateDealMetadataInput = z.infer<typeof updateDealMetadataSchema>;

export const reassignDealSchema = z.object({
  id: z.string().uuid(),
  assignedTo: z.string().uuid(),
});

export const transitionDealStageSchema = z.object({
  id: z.string().uuid(),
  toStage: z.enum(DEAL_STAGES),
  /** Required only when toStage === 'closed'. */
  closeStatus: z.enum(['won', 'lost']).optional(),
  lostReason: z.enum(DEAL_LOST_REASONS).optional(),
  lostReasonNote: trimmed.max(500).optional().or(z.literal('')),
  /** Required when crossing the high-risk guard; otherwise optional context. */
  overrideReason: trimmed.max(500).optional().or(z.literal('')),
  reason: trimmed.max(500).optional().or(z.literal('')),
});
export type TransitionDealStageInput = z.infer<typeof transitionDealStageSchema>;

export const closeDealSchema = z.object({
  id: z.string().uuid(),
  outcome: z.enum(['won', 'lost']),
  lostReason: z.enum(DEAL_LOST_REASONS).optional(),
  lostReasonNote: trimmed.max(500).optional().or(z.literal('')),
  overrideReason: trimmed.max(500).optional().or(z.literal('')),
});

export const addDealProductSchema = z.object({
  dealId: z.string().uuid(),
  productId: z.string().uuid(),
  estimatedQuantity: z.coerce.number().int().positive().max(100000).default(1),
  notes: trimmed.max(500).optional().or(z.literal('')),
});

export const updateDealProductSchema = z.object({
  id: z.string().uuid(),
  estimatedQuantity: z.coerce.number().int().positive().max(100000),
  notes: trimmed.max(500).optional().or(z.literal('')),
});

export const removeDealProductSchema = z.object({ id: z.string().uuid() });

export const dealIdSchema = z.object({ id: z.string().uuid() });

export const dealListFilterSchema = z.object({
  assignedTo: z.string().uuid().optional(),
  dealerId: z.string().uuid().optional(),
  hot: z.boolean().optional(),
  search: trimmed.max(200).optional(),
});
export type DealListFilter = z.infer<typeof dealListFilterSchema>;
