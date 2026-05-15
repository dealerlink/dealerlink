'use server';

import {
  deals as dealsTable,
  quotations,
  transitionDealStageDb,
  DealInvalidTransitionError,
  HighRiskGuardError,
} from '@dealerlink/db';
import { createQuotationSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import {
  allocateQuoteNumber,
  buildLineInserts,
  computeTotalsForPersistence,
  fiscalYear,
  loadDealerForQuotation,
  loadProductsForLines,
  loadTenantQuotationContext,
  writeStatusHistory,
} from './helpers';
import { quotationLines } from '@dealerlink/db';

export const createQuotation = tenantAction(
  ['admin', 'sales'],
  createQuotationSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    const role = auth.user.role;

    const tenantCtx = await loadTenantQuotationContext(tx, tenantId);
    const dealerCtx = await loadDealerForQuotation(tx, input.dealerId);

    // preparedBy: sales users can only prepare on their own behalf.
    let preparedBy = input.preparedBy ?? auth.user.id;
    if (role === 'sales') preparedBy = auth.user.id;

    // Validate optional deal link.
    if (input.dealId) {
      const [d] = await tx
        .select({ id: dealsTable.id, dealerId: dealsTable.dealerId, status: dealsTable.status })
        .from(dealsTable)
        .where(eq(dealsTable.id, input.dealId))
        .limit(1);
      if (!d) throw new AppError('NOT_FOUND', 'Linked deal not found');
      if (d.dealerId !== input.dealerId) {
        throw new AppError('VALIDATION', 'Deal does not belong to the selected dealer');
      }
    }

    const placeOfSupply = (input.placeOfSupplyOverride ?? dealerCtx.dealerState).toUpperCase();

    const productMap = await loadProductsForLines(tx, tenantId, input.lines);

    const totals = computeTotalsForPersistence(
      { lines: input.lines, discount: input.discount ?? null },
      tenantCtx.tenantState,
      placeOfSupply,
    );

    const fy = fiscalYear();
    const quoteNumber = await allocateQuoteNumber(tx, tenantId, tenantCtx.docPrefix, fy);

    const now = new Date();
    const initialStatus = input.sendOnSave ? 'sent' : 'draft';

    const [created] = await tx
      .insert(quotations)
      .values({
        tenantId,
        quoteNumber,
        revision: 1,
        parentQuotationId: null,
        dealId: input.dealId ?? null,
        dealerId: input.dealerId,
        preparedBy,
        tenantStateAtIssue: tenantCtx.tenantState,
        placeOfSupply,
        quoteDate: input.quoteDate ?? now.toISOString().slice(0, 10),
        validUntil: input.validUntil,
        currency: 'INR',
        discountType: input.discount?.type ?? null,
        discountValue: input.discount?.value != null ? input.discount.value.toFixed(2) : null,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxableAmount: totals.taxableAmount,
        cgstAmount: totals.cgstAmount,
        sgstAmount: totals.sgstAmount,
        igstAmount: totals.igstAmount,
        totalAmount: totals.totalAmount,
        termsAndConditions: input.termsAndConditions?.toString().trim() || tenantCtx.defaultTerms,
        notes: input.notes?.toString().trim() || null,
        status: initialStatus,
        sentAt: initialStatus === 'sent' ? now : null,
        sentVia: initialStatus === 'sent' ? 'email' : null,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: quotations.id, quoteNumber: quotations.quoteNumber });
    if (!created) throw new AppError('INTERNAL', 'Failed to create quotation');

    const inserts = buildLineInserts(input.lines, productMap, {
      tenantId,
      quotationId: created.id,
    });
    await tx.insert(quotationLines).values(inserts);

    await writeStatusHistory(tx, {
      tenantId,
      quotationId: created.id,
      fromStatus: null,
      toStatus: initialStatus,
      actorId: auth.user.id,
      reason: 'quotation_created',
    });

    // If sent on save and linked to a deal in needs_analysis, auto-advance.
    if (initialStatus === 'sent' && input.dealId) {
      try {
        await transitionDealStageDb(tx, input.dealId, 'quotation_sent', {
          role: role === 'admin' || role === 'sales' ? role : 'sales',
          userId: auth.user.id,
          automatic: true,
          reason: `quotation ${created.quoteNumber} sent`,
        });
      } catch (err) {
        // Allow non-applicable transitions (e.g., deal already past this stage)
        if (err instanceof DealInvalidTransitionError || err instanceof HighRiskGuardError) {
          // swallow — quotation send is still successful
        } else {
          throw err;
        }
      }
    }

    return { id: created.id, quoteNumber: created.quoteNumber, status: initialStatus };
  },
);
