'use server';

import { quotations, type QuotationStatus } from '@dealerlink/db';
import { updateQuotationSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import {
  computeTotalsForPersistence,
  loadDealerForQuotation,
  loadProductsForLines,
  loadQuotationForGuard,
  loadTenantQuotationContext,
  replaceLines,
} from './helpers';

const EDITABLE: QuotationStatus[] = ['draft'];

export const updateQuotation = tenantAction(
  ['admin', 'sales'],
  updateQuotationSchema,
  async ({ tx, input, auth }) => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (!EDITABLE.includes(existing.status)) {
      throw new AppError(
        'VALIDATION',
        `Cannot edit a quotation in "${existing.status}" status — revise it instead`,
      );
    }
    if (auth.user.role === 'sales' && existing.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only edit quotations you prepared');
    }

    const tenantId = auth.user.tenantId!;
    const tenantCtx = await loadTenantQuotationContext(tx, tenantId);

    const dealerId = input.dealerId;
    let placeOfSupply: string | undefined;
    if (dealerId) {
      const dealerCtx = await loadDealerForQuotation(tx, dealerId);
      placeOfSupply = (input.placeOfSupplyOverride ?? dealerCtx.dealerState).toUpperCase();
    } else if (input.placeOfSupplyOverride) {
      placeOfSupply = input.placeOfSupplyOverride.toUpperCase();
    }

    // Need full place_of_supply for the recompute; if not changing, read current.
    let effectivePlaceOfSupply = placeOfSupply;
    if (!effectivePlaceOfSupply) {
      const [row] = await tx
        .select({ placeOfSupply: quotations.placeOfSupply })
        .from(quotations)
        .where(eq(quotations.id, input.id))
        .limit(1);
      effectivePlaceOfSupply = row?.placeOfSupply ?? tenantCtx.tenantState;
    }

    const productMap = await loadProductsForLines(tx, tenantId, input.lines);
    const totals = computeTotalsForPersistence(
      { lines: input.lines, discount: input.discount ?? null },
      tenantCtx.tenantState,
      effectivePlaceOfSupply,
    );

    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: auth.user.id,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      totalAmount: totals.totalAmount,
      discountType: input.discount?.type ?? null,
      discountValue: input.discount?.value != null ? input.discount.value.toFixed(2) : null,
    };
    if (dealerId !== undefined) updates['dealerId'] = dealerId;
    if (input.dealId !== undefined) updates['dealId'] = input.dealId ?? null;
    if (input.preparedBy !== undefined && auth.user.role === 'admin') {
      updates['preparedBy'] = input.preparedBy;
    }
    if (input.quoteDate !== undefined) updates['quoteDate'] = input.quoteDate;
    if (input.validUntil !== undefined) updates['validUntil'] = input.validUntil;
    if (placeOfSupply !== undefined) updates['placeOfSupply'] = placeOfSupply;
    if (input.termsAndConditions !== undefined) {
      updates['termsAndConditions'] =
        typeof input.termsAndConditions === 'string'
          ? input.termsAndConditions.trim() || null
          : null;
    }
    if (input.notes !== undefined) {
      updates['notes'] = typeof input.notes === 'string' ? input.notes.trim() || null : null;
    }

    await tx.update(quotations).set(updates).where(eq(quotations.id, input.id));
    await replaceLines(tx, { tenantId, quotationId: input.id, lines: input.lines, productMap });

    return { id: input.id };
  },
);
