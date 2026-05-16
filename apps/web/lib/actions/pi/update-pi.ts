'use server';

import { performaInvoiceLines, performaInvoices } from '@dealerlink/db';
import { updatePiSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

import { loadProductsForLines } from '../quotations/helpers';
import {
  buildPiLineInserts,
  computeDocumentTotals,
  loadDealerForDocument,
  loadPiForGuard,
  type DocumentDiscount,
  type DocumentLine,
} from './helpers';

/**
 * Edit a draft PI. Lines, discount, validity, Ship-To and free text may all
 * change. Totals are always recomputed server-side; changing Ship-To to a
 * different state re-derives place of supply (ADR-012) and may flip the tax.
 */
export const updatePi = tenantAction(
  ['admin', 'sales'],
  updatePiSchema,
  async ({ tx, input, auth }) => {
    const pi = await loadPiForGuard(tx, input.id);
    if (!pi) throw new AppError('NOT_FOUND', 'Performa invoice not found');
    if (pi.status !== 'draft') {
      throw new AppError('VALIDATION', `Only draft PIs can be edited (this one is "${pi.status}")`);
    }
    if (auth.user.role === 'sales' && pi.preparedBy !== auth.user.id) {
      throw new AppError('FORBIDDEN', 'You can only edit PIs you prepared');
    }

    const tenantId = pi.tenantId;
    const shipToId = input.shipToDealerId ?? pi.shipToDealerId;
    const shipTo = await loadDealerForDocument(tx, shipToId, 'Ship-To');
    const placeOfSupply = (input.placeOfSupplyOverride ?? shipTo.state).toUpperCase();

    const productMap = await loadProductsForLines(tx, tenantId, input.lines);
    const lines: DocumentLine[] = input.lines.map((l) => {
      const p = productMap.get(l.productId);
      if (!p) throw new AppError('NOT_FOUND', `Product not found: ${l.productId}`);
      return {
        productId: p.id,
        productSku: p.sku,
        productName: p.name,
        hsnCode: p.hsnCode,
        quantity: Number(l.quantity),
        unitOfMeasure: l.unitOfMeasure || 'Nos',
        unitPrice: Number(l.unitPrice),
        gstRate: p.gstRate,
        description: l.description?.toString().trim() || null,
        notes: l.notes?.toString().trim() || null,
      };
    });

    const discount: DocumentDiscount | null =
      input.discount !== undefined
        ? input.discount
        : pi.discountType
          ? { type: pi.discountType, value: Number(pi.discountValue) }
          : null;

    const totals = computeDocumentTotals(lines, discount, pi.tenantStateAtIssue, placeOfSupply);

    await tx
      .delete(performaInvoiceLines)
      .where(eq(performaInvoiceLines.performaInvoiceId, input.id));
    await tx
      .insert(performaInvoiceLines)
      .values(buildPiLineInserts(lines, { tenantId, performaInvoiceId: input.id }));

    const now = new Date();
    await tx
      .update(performaInvoices)
      .set({
        shipToDealerId: shipToId,
        placeOfSupply,
        ...(input.validUntil ? { validUntil: input.validUntil } : {}),
        discountType: discount?.type ?? null,
        discountValue: discount?.value != null ? discount.value.toFixed(2) : null,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxableAmount: totals.taxableAmount,
        cgstAmount: totals.cgstAmount,
        sgstAmount: totals.sgstAmount,
        igstAmount: totals.igstAmount,
        totalAmount: totals.totalAmount,
        ...(input.termsAndConditions !== undefined
          ? { termsAndConditions: input.termsAndConditions?.toString().trim() || null }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.toString().trim() || null } : {}),
        updatedAt: now,
        updatedBy: auth.user.id,
      })
      .where(eq(performaInvoices.id, input.id));

    return { id: input.id, isInterState: totals.isInterState, placeOfSupply };
  },
);
