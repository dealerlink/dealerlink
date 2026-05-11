import { dealers, withTenant } from '@dealerlink/db';
import { type DealerListFilter, dealerListFilterSchema } from '@dealerlink/schemas';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';

export interface DealerListRow {
  id: string;
  dealerCode: string;
  legalName: string;
  displayName: string;
  gstin: string | null;
  state: string | null;
  type: 'retailer' | 'wholesaler' | 'installer' | 'epc' | 'other';
  category: 'A' | 'B' | 'C';
  riskLevel: 'low' | 'medium' | 'high';
  status: 'active' | 'inactive' | 'on_hold';
  creditLimit: string | null;
  creditPeriodDays: number | null;
  updatedAt: Date;
}

export interface DealerListResult {
  rows: DealerListRow[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * List dealers for a tenant with paginated/filterable/searchable results.
 * Search uses pg_trgm via ILIKE (the indexes are GIN trgm — ILIKE on `%foo%`
 * uses them once trgm sees ≥3 chars).
 */
export async function listDealers(
  tenantId: string,
  raw: Partial<DealerListFilter>,
): Promise<DealerListResult> {
  const filter = dealerListFilterSchema.parse(raw);
  return withTenant(tenantId, async (tx) => {
    const where = [eq(dealers.tenantId, tenantId)];
    if (filter.status) where.push(eq(dealers.status, filter.status));
    if (filter.type) where.push(eq(dealers.type, filter.type));
    if (filter.category) where.push(eq(dealers.category, filter.category));
    if (filter.riskLevel) where.push(eq(dealers.riskLevel, filter.riskLevel));
    if (filter.state) where.push(eq(dealers.state, filter.state));
    if (filter.tag) where.push(sql`${dealers.tags} @> ARRAY[${filter.tag}]::text[]`);
    if (filter.search && filter.search.trim().length > 0) {
      const q = `%${filter.search.trim()}%`;
      const searchClause = or(
        ilike(dealers.legalName, q),
        ilike(dealers.displayName, q),
        ilike(dealers.dealerCode, q),
        ilike(dealers.gstin, q),
      );
      if (searchClause) where.push(searchClause);
    }

    const whereClause = and(...where);

    const rows = await tx
      .select({
        id: dealers.id,
        dealerCode: dealers.dealerCode,
        legalName: dealers.legalName,
        displayName: dealers.displayName,
        gstin: dealers.gstin,
        state: dealers.state,
        type: dealers.type,
        category: dealers.category,
        riskLevel: dealers.riskLevel,
        status: dealers.status,
        creditLimit: dealers.creditLimit,
        creditPeriodDays: dealers.creditPeriodDays,
        updatedAt: dealers.updatedAt,
      })
      .from(dealers)
      .where(whereClause)
      .orderBy(desc(dealers.updatedAt))
      .limit(filter.limit)
      .offset(filter.offset);

    const [totalRow] = await tx.select({ value: count() }).from(dealers).where(whereClause);

    return {
      rows: rows as DealerListRow[],
      total: totalRow?.value ?? 0,
      limit: filter.limit,
      offset: filter.offset,
    };
  });
}

export async function getDealerById(tenantId: string, id: string) {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx.select().from(dealers).where(eq(dealers.id, id)).limit(1);
    return row ?? null;
  });
}

/** Lightweight search for typeahead in other modules. */
export async function searchDealers(tenantId: string, query: string, limit = 10) {
  const q = `%${query.trim()}%`;
  return withTenant(tenantId, async (tx) => {
    return tx
      .select({
        id: dealers.id,
        displayName: dealers.displayName,
        gstin: dealers.gstin,
        state: dealers.state,
        status: dealers.status,
      })
      .from(dealers)
      .where(
        and(
          eq(dealers.tenantId, tenantId),
          or(ilike(dealers.legalName, q), ilike(dealers.displayName, q), ilike(dealers.gstin, q))!,
        ),
      )
      .limit(limit);
  });
}
