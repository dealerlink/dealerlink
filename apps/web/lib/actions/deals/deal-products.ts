'use server';

import { dealProducts, deals, products } from '@dealerlink/db';
import {
  addDealProductSchema,
  removeDealProductSchema,
  updateDealProductSchema,
} from '@dealerlink/schemas';
import { and, eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

/** Add a product line to an existing deal. */
export const addDealProduct = tenantAction(
  ['admin', 'sales'],
  addDealProductSchema,
  async ({ tx, input, auth }) => {
    const [deal] = await tx
      .select({ id: deals.id, assignedTo: deals.assignedTo, status: deals.status })
      .from(deals)
      .where(eq(deals.id, input.dealId))
      .limit(1);
    if (!deal) throw new AppError('NOT_FOUND', 'Deal not found');
    if (deal.status !== 'open') {
      throw new AppError('VALIDATION', 'Cannot edit a closed deal');
    }
    if (auth.user.role === 'sales' && deal.assignedTo !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only edit deals assigned to you');
    }

    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new AppError('NOT_FOUND', 'Product not found');

    const [created] = await tx
      .insert(dealProducts)
      .values({
        tenantId: auth.user.tenantId!,
        dealId: input.dealId,
        productId: input.productId,
        estimatedQuantity: input.estimatedQuantity,
        notes: input.notes || null,
      })
      .returning({ id: dealProducts.id });
    if (!created) throw new AppError('INTERNAL', 'Failed to add product');

    await tx
      .update(deals)
      .set({ lastActivityAt: new Date(), updatedBy: auth.user.id })
      .where(eq(deals.id, input.dealId));

    return { id: created.id };
  },
);

export const updateDealProduct = tenantAction(
  ['admin', 'sales'],
  updateDealProductSchema,
  async ({ tx, input, auth }) => {
    const [row] = await tx
      .select({
        id: dealProducts.id,
        dealId: dealProducts.dealId,
      })
      .from(dealProducts)
      .where(eq(dealProducts.id, input.id))
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND', 'Line not found');

    const [deal] = await tx
      .select({ assignedTo: deals.assignedTo, status: deals.status })
      .from(deals)
      .where(eq(deals.id, row.dealId))
      .limit(1);
    if (!deal) throw new AppError('NOT_FOUND', 'Deal not found');
    if (deal.status !== 'open') {
      throw new AppError('VALIDATION', 'Cannot edit a closed deal');
    }
    if (auth.user.role === 'sales' && deal.assignedTo !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only edit deals assigned to you');
    }

    await tx
      .update(dealProducts)
      .set({
        estimatedQuantity: input.estimatedQuantity,
        notes: input.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(dealProducts.id, input.id));

    await tx
      .update(deals)
      .set({ lastActivityAt: new Date(), updatedBy: auth.user.id })
      .where(eq(deals.id, row.dealId));

    return { id: input.id };
  },
);

export const removeDealProduct = tenantAction(
  ['admin', 'sales'],
  removeDealProductSchema,
  async ({ tx, input, auth }) => {
    const [row] = await tx
      .select({ id: dealProducts.id, dealId: dealProducts.dealId })
      .from(dealProducts)
      .where(eq(dealProducts.id, input.id))
      .limit(1);
    if (!row) throw new AppError('NOT_FOUND', 'Line not found');

    const [deal] = await tx
      .select({ assignedTo: deals.assignedTo, status: deals.status })
      .from(deals)
      .where(eq(deals.id, row.dealId))
      .limit(1);
    if (!deal) throw new AppError('NOT_FOUND', 'Deal not found');
    if (deal.status !== 'open') {
      throw new AppError('VALIDATION', 'Cannot edit a closed deal');
    }
    if (auth.user.role === 'sales' && deal.assignedTo !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only edit deals assigned to you');
    }

    await tx.delete(dealProducts).where(and(eq(dealProducts.id, input.id)));
    await tx
      .update(deals)
      .set({ lastActivityAt: new Date(), updatedBy: auth.user.id })
      .where(eq(deals.id, row.dealId));

    return { id: input.id };
  },
);
