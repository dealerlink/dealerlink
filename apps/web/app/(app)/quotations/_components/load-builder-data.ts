import { dealers, deals, products, tenantSettings, users, withTenant } from '@dealerlink/db';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import type {
  BuilderContext,
  DealOption,
  DealerOption,
  ProductOption,
  UserOption,
} from './builder-types';

export interface BuilderData {
  dealers: DealerOption[];
  products: ProductOption[];
  deals: DealOption[];
  salesUsers: UserOption[];
  context: BuilderContext;
}

export async function loadBuilderData(tenantId: string): Promise<BuilderData> {
  return withTenant(tenantId, async (tx) => {
    const [settings] = await tx
      .select({
        state: tenantSettings.state,
        defaultTerms: tenantSettings.defaultTerms,
        defaultQuoteValidity: tenantSettings.defaultQuoteValidity,
      })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);

    const [dealerRows, productRows, dealRows, userRows] = await Promise.all([
      tx
        .select({
          id: dealers.id,
          code: dealers.dealerCode,
          name: dealers.displayName,
          state: dealers.state,
        })
        .from(dealers)
        .where(and(eq(dealers.status, 'active'), isNull(dealers.deletedAt)))
        .orderBy(asc(dealers.displayName)),
      tx
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          hsnCode: products.hsnCode,
          gstRate: products.gstRate,
          defaultSellingPrice: products.defaultSellingPrice,
        })
        .from(products)
        .where(and(eq(products.status, 'active'), isNull(products.deletedAt)))
        .orderBy(asc(products.name)),
      tx
        .select({
          id: deals.id,
          dealCode: deals.dealCode,
          title: deals.title,
          dealerId: deals.dealerId,
        })
        .from(deals)
        .where(and(eq(deals.status, 'open'), ne(deals.stage, 'closed')))
        .orderBy(asc(deals.dealCode)),
      tx
        .select({
          id: users.id,
          fullName: users.fullName,
          email: users.email,
          role: users.role,
        })
        .from(users)
        .where(and(eq(users.status, 'active'))),
    ]);

    return {
      dealers: dealerRows.map((d) => ({
        id: d.id,
        label: `${d.name} · ${d.code}`,
        state: d.state,
      })),
      products: productRows.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        hsnCode: p.hsnCode,
        gstRate: Number(p.gstRate),
        defaultSellingPrice: p.defaultSellingPrice != null ? Number(p.defaultSellingPrice) : null,
      })),
      deals: dealRows.map((d) => ({
        id: d.id,
        label: `${d.dealCode} — ${d.title}`,
        dealerId: d.dealerId,
      })),
      salesUsers: userRows
        .filter((u) => u.role === 'admin' || u.role === 'sales')
        .map((u) => ({
          id: u.id,
          label: `${u.fullName ?? u.email} (${u.role})`,
        })),
      context: {
        tenantState: (settings?.state ?? 'XX').toUpperCase(),
        defaultQuoteValidity: settings?.defaultQuoteValidity ?? 15,
        defaultTerms: settings?.defaultTerms ?? null,
      },
    };
  });
}
