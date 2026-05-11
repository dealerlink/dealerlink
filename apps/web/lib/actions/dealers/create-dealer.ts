'use server';

import { dealers, nextDealerCode } from '@dealerlink/db';
import { createDealerSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { panFromGSTIN } from '@/lib/format';
import { AppError } from '@/lib/errors';

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Create a new dealer. Allowed: admin, sales. */
export const createDealer = tenantAction(
  ['admin', 'sales'],
  createDealerSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId;
    // tenantAction has already verified the tenant context.
    const dealerCode = await nextDealerCode(tx, tenantId!);

    const gstin = emptyToNull(input.gstin);
    const pan = emptyToNull(input.pan) ?? (gstin ? panFromGSTIN(gstin) : null);

    // Pre-check GSTIN uniqueness to give a friendly error before the
    // partial-unique-index violation surfaces from Postgres.
    if (gstin) {
      const [existing] = await tx
        .select({ id: dealers.id })
        .from(dealers)
        .where(eq(dealers.gstin, gstin))
        .limit(1);
      if (existing) {
        throw new AppError('CONFLICT', `A dealer with GSTIN ${gstin} already exists`);
      }
    }

    const [created] = await tx
      .insert(dealers)
      .values({
        tenantId: tenantId!,
        dealerCode,
        legalName: input.legalName,
        displayName: input.displayName,
        contactPerson: emptyToNull(input.contactPerson),
        phone: emptyToNull(input.phone),
        altPhone: emptyToNull(input.altPhone),
        email: emptyToNull(input.email),
        altEmail: emptyToNull(input.altEmail),
        addressLine1: emptyToNull(input.addressLine1),
        addressLine2: emptyToNull(input.addressLine2),
        city: emptyToNull(input.city),
        state: emptyToNull(input.state),
        pincode: emptyToNull(input.pincode),
        country: input.country || 'IN',
        gstin,
        pan,
        type: input.type,
        category: input.category,
        riskLevel: input.riskLevel,
        creditLimit: input.creditLimit != null ? String(input.creditLimit) : null,
        creditPeriodDays: input.creditPeriodDays ?? null,
        discountPercent: String(input.discountPercent ?? 0),
        notes: emptyToNull(input.notes),
        tags: input.tags,
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: dealers.id, dealerCode: dealers.dealerCode });

    if (!created) throw new AppError('INTERNAL', 'Failed to create dealer');
    return { id: created.id, dealerCode: created.dealerCode };
  },
);
