'use server';

import { dealers, nextDealerCode } from '@dealerlink/db';
import { bulkImportDealersSchema } from '@dealerlink/schemas';
import { inArray } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { panFromGSTIN } from '@/lib/format';

function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Atomic bulk import. Either every row inserts, or nothing does — partial
 * imports are explicitly forbidden in Phase 1 per the Day 5 guardrails.
 * Returns a per-row result so the operator UI can show what was inserted
 * (and, on failure, point at the first bad row).
 */
export const bulkImportDealers = tenantAction(
  ['admin'],
  bulkImportDealersSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;

    // Conflict check: any GSTIN already in the table?
    const gstins = input.rows
      .map((r) => (r.gstin && r.gstin.trim().length > 0 ? r.gstin.trim().toUpperCase() : null))
      .filter((g): g is string => !!g);

    if (gstins.length > 0) {
      const existing = await tx
        .select({ gstin: dealers.gstin })
        .from(dealers)
        .where(inArray(dealers.gstin, gstins));
      if (existing.length > 0) {
        const dup = existing[0]?.gstin ?? '';
        throw new AppError('CONFLICT', `GSTIN ${dup} already exists — entire import rolled back`);
      }
    }

    const inserted: { dealerCode: string; legalName: string }[] = [];
    for (const row of input.rows) {
      const dealerCode = await nextDealerCode(tx, tenantId);
      const gstin = emptyToNull(row.gstin);
      const pan = emptyToNull(row.pan) ?? (gstin ? panFromGSTIN(gstin) : null);
      const [created] = await tx
        .insert(dealers)
        .values({
          tenantId,
          dealerCode,
          legalName: row.legalName,
          displayName: row.displayName,
          contactPerson: emptyToNull(row.contactPerson),
          phone: emptyToNull(row.phone),
          altPhone: emptyToNull(row.altPhone),
          email: emptyToNull(row.email),
          altEmail: emptyToNull(row.altEmail),
          addressLine1: emptyToNull(row.addressLine1),
          addressLine2: emptyToNull(row.addressLine2),
          city: emptyToNull(row.city),
          state: emptyToNull(row.state),
          pincode: emptyToNull(row.pincode),
          country: row.country || 'IN',
          gstin,
          pan,
          type: row.type,
          category: row.category,
          riskLevel: row.riskLevel,
          creditLimit: row.creditLimit != null ? String(row.creditLimit) : null,
          creditPeriodDays: row.creditPeriodDays ?? null,
          discountPercent: String(row.discountPercent ?? 0),
          notes: emptyToNull(row.notes),
          tags: row.tags ?? [],
          createdBy: auth.user.id,
          updatedBy: auth.user.id,
        })
        .returning({ dealerCode: dealers.dealerCode, legalName: dealers.legalName });
      if (created) inserted.push(created);
    }

    return { count: inserted.length, inserted };
  },
);
