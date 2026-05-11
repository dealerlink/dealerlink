'use server';

import { products } from '@dealerlink/db';
import { createProductSchema } from '@dealerlink/schemas';
import { and, eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export const createProduct = tenantAction(
  ['admin'],
  createProductSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;
    const sku = input.sku.trim();

    const [existing] = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.sku, sku)))
      .limit(1);
    if (existing) {
      throw new AppError('CONFLICT', `A product with SKU "${sku}" already exists`);
    }

    const [created] = await tx
      .insert(products)
      .values({
        tenantId,
        sku,
        name: input.name,
        description: emptyToNull(input.description),
        manufacturer: emptyToNull(input.manufacturer),
        model: emptyToNull(input.model),
        hsnCode: input.hsnCode,
        gstRate: String(input.gstRate),
        category: emptyToNull(input.category),
        subcategory: emptyToNull(input.subcategory),
        specs: input.specs ?? {},
        mrp: input.mrp != null ? String(input.mrp) : null,
        defaultPurchasePrice:
          input.defaultPurchasePrice != null ? String(input.defaultPurchasePrice) : null,
        defaultSellingPrice:
          input.defaultSellingPrice != null ? String(input.defaultSellingPrice) : null,
        requiresSerial: input.requiresSerial,
        unitOfMeasure: input.unitOfMeasure,
        status: 'active',
        createdBy: auth.user.id,
        updatedBy: auth.user.id,
      })
      .returning({ id: products.id, sku: products.sku });

    if (!created) throw new AppError('INTERNAL', 'Failed to create product');
    return { id: created.id, sku: created.sku };
  },
);
