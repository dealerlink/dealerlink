'use server';

import { quotationLines, quotations } from '@dealerlink/db';
import { reviseQuotationSchema } from '@dealerlink/schemas';
import { asc, eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import { writeStatusHistory } from './helpers';

const REVISABLE = new Set(['sent', 'accepted', 'rejected', 'expired']);

/**
 * Create a new revision based on an existing quotation. The new quotation
 * inherits the parent's quote_number and bumps the revision, with all
 * lines + commercial fields copied. Parent flips to 'superseded'
 * atomically. The new revision opens in 'draft' so the user can edit
 * before sending.
 */
export const reviseQuotation = tenantAction(
  ['admin', 'sales'],
  reviseQuotationSchema,
  async ({ tx, input, auth }) => {
    const [parent] = await tx.select().from(quotations).where(eq(quotations.id, input.id)).limit(1);
    if (!parent) throw new AppError('NOT_FOUND', 'Quotation not found');
    if (!REVISABLE.has(parent.status)) {
      throw new AppError('VALIDATION', `Cannot revise a quotation in "${parent.status}" status`);
    }
    if (auth.user.role === 'sales' && parent.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only revise quotations you prepared');
    }

    const nextRevision = parent.revision + 1;
    const now = new Date();

    const [created] = await tx
      .insert(quotations)
      .values({
        tenantId: parent.tenantId,
        quoteNumber: parent.quoteNumber,
        revision: nextRevision,
        parentQuotationId: parent.id,
        dealId: parent.dealId,
        dealerId: parent.dealerId,
        preparedBy: auth.user.id,
        tenantStateAtIssue: parent.tenantStateAtIssue,
        placeOfSupply: parent.placeOfSupply,
        quoteDate: now.toISOString().slice(0, 10),
        validUntil: parent.validUntil,
        currency: parent.currency,
        discountType: parent.discountType,
        discountValue: parent.discountValue,
        subtotal: parent.subtotal,
        discountAmount: parent.discountAmount,
        taxableAmount: parent.taxableAmount,
        cgstAmount: parent.cgstAmount,
        sgstAmount: parent.sgstAmount,
        igstAmount: parent.igstAmount,
        totalAmount: parent.totalAmount,
        termsAndConditions: parent.termsAndConditions,
        notes: parent.notes,
        status: 'draft',
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: quotations.id, quoteNumber: quotations.quoteNumber });
    if (!created) throw new AppError('INTERNAL', 'Failed to create revision');

    // Copy lines.
    const parentLines = await tx
      .select()
      .from(quotationLines)
      .where(eq(quotationLines.quotationId, parent.id))
      .orderBy(asc(quotationLines.lineNumber));
    if (parentLines.length > 0) {
      await tx.insert(quotationLines).values(
        parentLines.map((l) => ({
          tenantId: parent.tenantId,
          quotationId: created.id,
          lineNumber: l.lineNumber,
          productId: l.productId,
          productSku: l.productSku,
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          unitOfMeasure: l.unitOfMeasure,
          unitPrice: l.unitPrice,
          gstRate: l.gstRate,
          lineTotal: l.lineTotal,
          description: l.description,
          notes: l.notes,
        })),
      );
    }

    // Mark parent superseded.
    await tx
      .update(quotations)
      .set({ status: 'superseded', updatedAt: now, updatedBy: auth.user.id })
      .where(eq(quotations.id, parent.id));

    await writeStatusHistory(tx, {
      tenantId: parent.tenantId,
      quotationId: parent.id,
      fromStatus: parent.status,
      toStatus: 'superseded',
      actorId: auth.user.id,
      reason: `revised_to_rev_${nextRevision}`,
    });
    await writeStatusHistory(tx, {
      tenantId: parent.tenantId,
      quotationId: created.id,
      fromStatus: null,
      toStatus: 'draft',
      actorId: auth.user.id,
      reason: `revised_from_${parent.quoteNumber}_rev_${parent.revision}`,
    });

    return {
      id: created.id,
      quoteNumber: created.quoteNumber,
      revision: nextRevision,
      parentId: parent.id,
    };
  },
);
