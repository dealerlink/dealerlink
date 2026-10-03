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
    // PREFIX IS DELIBERATELY NOT TENANT-CONFIGURABLE, and this is not an
    // oversight — operator ruling, 2026-10-04 (F.195).
    //
    // The other six series read `tenant_settings.doc_prefixes`. These two do
    // not, because **configurable prefixes exist so a tenant's OUTGOING
    // PAPERWORK matches their existing conventions** — and a PROCUREMENT NUMBER is purchase-side.
    // Nothing a customer sees carries this number.
    //
    // So: if you are here because the inconsistency looked like a bug, it is
    // not one. If a tenant ever genuinely needs to set it, that is a product
    // decision with its own consequences (it would change what new documents
    // are numbered the moment settings are edited, and `doc_prefixes` would
    // gain two keys) — raise it, do not fold it into a formatting change.
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
