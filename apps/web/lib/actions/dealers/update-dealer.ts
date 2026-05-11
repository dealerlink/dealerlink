'use server';

import { dealers } from '@dealerlink/db';
import {
  updateDealerCommercialSchema,
  updateDealerSchema,
  deactivateDealerSchema,
  dealerIdSchema,
} from '@dealerlink/schemas';
import { and, eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { panFromGSTIN } from '@/lib/format';

function emptyToNull(v: string | undefined | null): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Update profile (identity, address, compliance, classification). Allowed: admin, sales. */
export const updateDealer = tenantAction(
  ['admin', 'sales'],
  updateDealerSchema,
  async ({ tx, input, auth }) => {
    const { id, ...rest } = input;
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: auth.user.id,
    };

    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      if (k === 'gstin' && typeof v === 'string') {
        const gstin = emptyToNull(v);
        patch.gstin = gstin;
        // Derive PAN if not separately provided in this patch.
        if (gstin && !('pan' in rest)) {
          patch.pan = panFromGSTIN(gstin);
        }
        continue;
      }
      if (typeof v === 'string') {
        patch[k] = emptyToNull(v);
      } else {
        patch[k] = v;
      }
    }

    const [updated] = await tx
      .update(dealers)
      .set(patch)
      .where(eq(dealers.id, id))
      .returning({ id: dealers.id });

    if (!updated) throw new AppError('NOT_FOUND', 'Dealer not found');
    return { id: updated.id };
  },
);

/** Update commercial terms — admin only (BRD §2). */
export const updateDealerCommercial = tenantAction(
  ['admin'],
  updateDealerCommercialSchema,
  async ({ tx, input, auth }) => {
    const { id, creditLimit, creditPeriodDays, discountPercent } = input;
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: auth.user.id,
    };
    if (creditLimit !== undefined) {
      patch.creditLimit = creditLimit === null ? null : String(creditLimit);
    }
    if (creditPeriodDays !== undefined) {
      patch.creditPeriodDays = creditPeriodDays;
    }
    if (discountPercent !== undefined) {
      patch.discountPercent = String(discountPercent);
    }

    const [updated] = await tx
      .update(dealers)
      .set(patch)
      .where(eq(dealers.id, id))
      .returning({ id: dealers.id });

    if (!updated) throw new AppError('NOT_FOUND', 'Dealer not found');
    return { id: updated.id };
  },
);

/** Deactivate a dealer with a captured reason. Admin only. */
export const deactivateDealer = tenantAction(
  ['admin'],
  deactivateDealerSchema,
  async ({ tx, input, auth }) => {
    const [updated] = await tx
      .update(dealers)
      .set({
        status: 'inactive',
        inactivatedAt: new Date(),
        inactivatedReason: input.reason,
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(and(eq(dealers.id, input.id), eq(dealers.status, 'active')))
      .returning({ id: dealers.id });
    if (!updated) {
      throw new AppError('CONFLICT', 'Dealer is not active or has already been deactivated');
    }
    return { id: updated.id };
  },
);

/** Reactivate a previously-deactivated dealer. Admin only. */
export const reactivateDealer = tenantAction(
  ['admin'],
  dealerIdSchema,
  async ({ tx, input, auth }) => {
    const [updated] = await tx
      .update(dealers)
      .set({
        status: 'active',
        inactivatedAt: null,
        inactivatedReason: null,
        updatedAt: new Date(),
        updatedBy: auth.user.id,
      })
      .where(eq(dealers.id, input.id))
      .returning({ id: dealers.id });
    if (!updated) throw new AppError('NOT_FOUND', 'Dealer not found');
    return { id: updated.id };
  },
);
