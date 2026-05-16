'use server';

import { inventoryItems, procurementItems, procurements } from '@dealerlink/db';
import { submitSerialsSchema } from '@dealerlink/schemas';
import { and, eq, inArray } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

export const submitSerials = tenantAction(
  ['admin', 'dispatch'],
  submitSerialsSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;

    const [proc] = await tx
      .select({
        id: procurements.id,
        status: procurements.status,
        procurementDate: procurements.procurementDate,
      })
      .from(procurements)
      .where(eq(procurements.id, input.procurementId))
      .limit(1);
    if (!proc) throw new AppError('NOT_FOUND', 'Procurement not found');
    if (proc.status !== 'confirmed') {
      throw new AppError(
        'VALIDATION',
        `Procurement must be confirmed before submitting serials (current: ${proc.status})`,
      );
    }

    const [line] = await tx
      .select()
      .from(procurementItems)
      .where(
        and(
          eq(procurementItems.procurementId, input.procurementId),
          eq(procurementItems.productId, input.productId),
        ),
      )
      .limit(1);
    if (!line) throw new AppError('NOT_FOUND', 'Procurement line not found for product');

    // Check for duplicates within the submission
    const trimmed = input.serials.map((s) => s.trim()).filter((s) => s.length > 0);
    const set = new Set<string>();
    for (const s of trimmed) {
      if (set.has(s)) throw new AppError('VALIDATION', `Duplicate serial in submission: ${s}`);
      set.add(s);
    }

    const remaining = line.quantity - line.serialsReceived;
    if (trimmed.length > remaining) {
      throw new AppError(
        'VALIDATION',
        `Cannot accept ${trimmed.length} serials; only ${remaining} remaining for this line`,
      );
    }

    // Pre-check tenant uniqueness of incoming serials (gives a friendly error
    // before the partial unique index kicks in). `inArray` renders an IN (…)
    // list of bound params — a raw `= ANY(${array})` mis-binds under the
    // postgres.js driver (DEV.56).
    if (trimmed.length > 0) {
      const existing = await tx
        .select({ serialNumber: inventoryItems.serialNumber })
        .from(inventoryItems)
        .where(
          and(eq(inventoryItems.tenantId, tenantId), inArray(inventoryItems.serialNumber, trimmed)),
        );
      const dupes = existing.map((r) => r.serialNumber).filter((s): s is string => s != null);
      if (dupes.length > 0) {
        throw new AppError('CONFLICT', `Serial(s) already exist in inventory: ${dupes.join(', ')}`);
      }
    }

    for (const sn of trimmed) {
      await tx.insert(inventoryItems).values({
        tenantId,
        productId: input.productId,
        serialNumber: sn,
        status: 'in_stock',
        warehouseCode: 'WH-MAIN',
        procurementId: input.procurementId,
        procurementDate: proc.procurementDate,
        purchasePrice: line.unitPrice,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      });
    }

    const newReceived = line.serialsReceived + trimmed.length;
    await tx
      .update(procurementItems)
      .set({ serialsReceived: newReceived, updatedAt: new Date() })
      .where(eq(procurementItems.id, line.id));

    return { received: trimmed.length, totalReceived: newReceived, expected: line.quantity };
  },
);
