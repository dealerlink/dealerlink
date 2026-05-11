'use server';

import { products } from '@dealerlink/db';
import { productIdSchema, updateProductSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

function emptyToNull(v: string | undefined | null): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

const NUMERIC_FIELDS = new Set(['mrp', 'defaultPurchasePrice', 'defaultSellingPrice', 'gstRate']);

export const updateProduct = tenantAction(
  ['admin'],
  updateProductSchema,
  async ({ tx, input, auth }) => {
    const { id, ...rest } = input;
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
      updatedBy: auth.user.id,
    };
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      if (NUMERIC_FIELDS.has(k)) {
        patch[k] = v === null ? null : String(v);
        continue;
      }
      if (typeof v === 'string') {
        patch[k] = emptyToNull(v);
      } else {
        patch[k] = v;
      }
    }

    const [updated] = await tx
      .update(products)
      .set(patch)
      .where(eq(products.id, id))
      .returning({ id: products.id });
    if (!updated) throw new AppError('NOT_FOUND', 'Product not found');
    return { id: updated.id };
  },
);

function makeStatusAction(target: 'active' | 'inactive' | 'discontinued') {
  return tenantAction(['admin'], productIdSchema, async ({ tx, input, auth }) => {
    const [updated] = await tx
      .update(products)
      .set({ status: target, updatedAt: new Date(), updatedBy: auth.user.id })
      .where(eq(products.id, input.id))
      .returning({ id: products.id });
    if (!updated) throw new AppError('NOT_FOUND', 'Product not found');
    return { id: updated.id };
  });
}

export const deactivateProduct = makeStatusAction('inactive');
export const reactivateProduct = makeStatusAction('active');
export const discontinueProduct = makeStatusAction('discontinued');
