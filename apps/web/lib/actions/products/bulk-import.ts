'use server';

import { products } from '@dealerlink/db';
import { bulkImportProductsSchema } from '@dealerlink/schemas';
import { and, eq, inArray } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';

function emptyToNull(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

export const bulkImportProducts = tenantAction(
  ['admin'],
  bulkImportProductsSchema,
  async ({ tx, input, auth }) => {
    const tenantId = auth.user.tenantId!;

    const skus = input.rows.map((r) => r.sku.trim());
    const dupes = await tx
      .select({ sku: products.sku })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), inArray(products.sku, skus)));
    if (dupes.length > 0) {
      const dup = dupes[0]?.sku ?? '';
      throw new AppError('CONFLICT', `SKU "${dup}" already exists — entire import rolled back`);
    }

    const inserted: { sku: string; name: string }[] = [];
    for (const row of input.rows) {
      const [created] = await tx
        .insert(products)
        .values({
          tenantId,
          sku: row.sku.trim(),
          name: row.name,
          description: emptyToNull(row.description),
          manufacturer: emptyToNull(row.manufacturer),
          model: emptyToNull(row.model),
          hsnCode: row.hsnCode,
          gstRate: String(row.gstRate),
          category: emptyToNull(row.category),
          subcategory: emptyToNull(row.subcategory),
          specs: row.specs ?? {},
          mrp: row.mrp != null ? String(row.mrp) : null,
          defaultPurchasePrice:
            row.defaultPurchasePrice != null ? String(row.defaultPurchasePrice) : null,
          defaultSellingPrice:
            row.defaultSellingPrice != null ? String(row.defaultSellingPrice) : null,
          requiresSerial: row.requiresSerial,
          unitOfMeasure: row.unitOfMeasure,
          status: 'active',
          createdBy: auth.user.id,
          updatedBy: auth.user.id,
        })
        .returning({ sku: products.sku, name: products.name });
      if (created) inserted.push(created);
    }
    return { count: inserted.length, inserted };
  },
);
