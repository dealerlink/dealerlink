'use server';

import {
  dealProducts,
  dealStageHistory,
  dealers,
  deals,
  nextCounter,
  products,
} from '@dealerlink/db';
import { createDealSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import { fiscalYear } from './fiscal-year';

function emptyToNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Create a new deal at stage='qualification'. Allowed: admin, sales. */
export const createDeal = tenantAction(
  ['admin', 'sales'],
  createDealSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    const role = auth.user.role;

    // Sales users cannot reassign on create — they own their own deals.
    const assignedTo = role === 'sales' ? auth.user.id : (input.assignedTo ?? auth.user.id);

    // Validate dealer is in this tenant + not soft-deleted.
    const [dealer] = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.id, input.dealerId))
      .limit(1);
    if (!dealer) throw new AppError('NOT_FOUND', 'Dealer not found');

    const fy = fiscalYear();
    const seq = await nextCounter(tx, tenantId, 'deal', fy);
    const dealCode = `DEAL-${fy}-${String(seq).padStart(4, '0')}`;

    const now = new Date();
    const [created] = await tx
      .insert(deals)
      .values({
        tenantId,
        dealCode,
        title: input.title,
        dealerId: input.dealerId,
        assignedTo,
        stage: 'qualification',
        status: 'open',
        estimatedValue: input.estimatedValue != null ? String(input.estimatedValue) : null,
        probabilityPercent: input.probabilityPercent ?? null,
        expectedCloseDate: input.expectedCloseDate ?? null,
        source: input.source,
        notes: emptyToNull(input.notes),
        hot: input.hot,
        lastActivityAt: now,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: deals.id, dealCode: deals.dealCode });

    if (!created) throw new AppError('INTERNAL', 'Failed to create deal');

    // Insert line products. Validate each productId belongs to the tenant
    // (RLS will block foreign tenants but we want a friendlier error).
    const productLines = input.products ?? [];
    if (productLines.length > 0) {
      const rows = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.tenantId, tenantId));
      const valid = new Set(rows.map((r) => r.id));
      for (const p of productLines) {
        if (!valid.has(p.productId)) {
          throw new AppError('NOT_FOUND', `Product not found: ${p.productId}`);
        }
      }
      await tx.insert(dealProducts).values(
        productLines.map((p) => ({
          tenantId,
          dealId: created.id,
          productId: p.productId,
          estimatedQuantity: p.estimatedQuantity,
          notes: emptyToNull(p.notes),
        })),
      );
    }

    // Initial history row — record the deal creation as the first entry.
    await tx.insert(dealStageHistory).values({
      tenantId,
      dealId: created.id,
      fromStage: null,
      toStage: 'qualification',
      fromStatus: null,
      toStatus: 'open',
      transitionedBy: auth.user.id,
      automatic: false,
      overridden: false,
      reason: 'deal_created',
    });

    return { id: created.id, dealCode: created.dealCode };
  },
);
