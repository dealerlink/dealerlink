'use server';

import { nextCounter, procurementItems, procurements } from '@dealerlink/db';
import { createProcurementSchema } from '@dealerlink/schemas';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

function fiscalYear(date: Date): number {
  const m = date.getUTCMonth(); // 0=Jan
  return m >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

export const createProcurement = tenantAction(
  ['admin', 'dispatch'],
  createProcurementSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    const fy = fiscalYear(new Date(input.procurementDate));
    const seq = await nextCounter(tx, tenantId, 'procurement', fy);
    const procurementNumber = `PROC-${fy}-${String(seq).padStart(4, '0')}`;

    const total = input.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

    const [proc] = await tx
      .insert(procurements)
      .values({
        tenantId,
        procurementNumber,
        procurementDate: input.procurementDate,
        supplierName: input.supplierName,
        invoiceNumber: input.invoiceNumber || null,
        invoiceDate: input.invoiceDate || null,
        invoiceAttachmentUrl: input.invoiceAttachmentUrl || null,
        notes: input.notes || null,
        totalAmount: total.toFixed(2),
        status: 'draft',
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: procurements.id, procurementNumber: procurements.procurementNumber });

    if (!proc) throw new AppError('INTERNAL', 'Failed to create procurement');

    for (const line of input.lines) {
      const lineTotal = line.quantity * line.unitPrice;
      await tx.insert(procurementItems).values({
        tenantId,
        procurementId: proc.id,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      });
    }

    return { id: proc.id, procurementNumber: proc.procurementNumber };
  },
);
