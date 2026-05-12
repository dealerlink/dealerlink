import {
  dealProducts,
  dealStageHistory,
  dealers,
  deals,
  products,
  users,
  withTenant,
  type DealStage,
} from '@dealerlink/db';
import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

export interface DealCard {
  id: string;
  dealCode: string;
  title: string;
  stage: DealStage;
  status: 'open' | 'won' | 'lost';
  estimatedValue: number | null;
  hot: boolean;
  lastActivityAt: Date;
  expectedCloseDate: string | null;
  probabilityPercent: number | null;
  dealer: {
    id: string;
    name: string;
    state: string | null;
    riskLevel: 'low' | 'medium' | 'high';
  };
  assignee: {
    id: string;
    fullName: string;
    initials: string;
  };
}

export interface ListDealsOptions {
  assignedTo?: string;
  dealerId?: string;
  hot?: boolean;
  search?: string;
  /** When set, only include deals last active on or after this date. */
  activeSince?: Date;
  /** Default: only open deals appear on the kanban. */
  includeClosed?: boolean;
}

function initialsFrom(name: string | null | undefined): string {
  if (!name) return '·';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Return all (open) deals for a tenant grouped by stage. The map is dense:
 * every stage appears as a key, even if empty.
 */
export async function listDealsByStage(
  tenantId: string,
  opts: ListDealsOptions = {},
): Promise<Map<DealStage, DealCard[]>> {
  return withTenant(tenantId, async (tx) => {
    const where = [eq(deals.tenantId, tenantId)];
    if (!opts.includeClosed) where.push(eq(deals.status, 'open'));
    if (opts.assignedTo) where.push(eq(deals.assignedTo, opts.assignedTo));
    if (opts.dealerId) where.push(eq(deals.dealerId, opts.dealerId));
    if (opts.hot === true) where.push(eq(deals.hot, true));
    if (opts.activeSince) where.push(sql`${deals.lastActivityAt} >= ${opts.activeSince}`);
    if (opts.search && opts.search.trim().length > 0) {
      const q = `%${opts.search.trim()}%`;
      const clause = or(ilike(deals.title, q), ilike(deals.dealCode, q));
      if (clause) where.push(clause);
    }

    const rows = await tx
      .select({
        id: deals.id,
        dealCode: deals.dealCode,
        title: deals.title,
        stage: deals.stage,
        status: deals.status,
        estimatedValue: deals.estimatedValue,
        hot: deals.hot,
        lastActivityAt: deals.lastActivityAt,
        expectedCloseDate: deals.expectedCloseDate,
        probabilityPercent: deals.probabilityPercent,
        dealerId: deals.dealerId,
        dealerName: dealers.displayName,
        dealerState: dealers.state,
        dealerRisk: dealers.riskLevel,
        assigneeId: deals.assignedTo,
        assigneeName: users.fullName,
      })
      .from(deals)
      .leftJoin(dealers, eq(dealers.id, deals.dealerId))
      .leftJoin(users, eq(users.id, deals.assignedTo))
      .where(and(...where))
      .orderBy(desc(deals.hot), desc(deals.lastActivityAt));

    const grouped = new Map<DealStage, DealCard[]>();
    const ALL: DealStage[] = [
      'qualification',
      'needs_analysis',
      'quotation_sent',
      'negotiation',
      'verbal_commit',
      'po_pending',
      'payment_pending',
      'ready_for_dispatch',
      'closed',
    ];
    for (const s of ALL) grouped.set(s, []);

    for (const r of rows) {
      const card: DealCard = {
        id: r.id,
        dealCode: r.dealCode,
        title: r.title,
        stage: r.stage,
        status: r.status,
        estimatedValue: r.estimatedValue != null ? Number(r.estimatedValue) : null,
        hot: r.hot,
        lastActivityAt: r.lastActivityAt,
        expectedCloseDate: r.expectedCloseDate,
        probabilityPercent: r.probabilityPercent,
        dealer: {
          id: r.dealerId,
          name: r.dealerName ?? '—',
          state: r.dealerState,
          riskLevel: (r.dealerRisk ?? 'low') as 'low' | 'medium' | 'high',
        },
        assignee: {
          id: r.assigneeId,
          fullName: r.assigneeName ?? '—',
          initials: initialsFrom(r.assigneeName),
        },
      };
      grouped.get(r.stage)?.push(card);
    }

    return grouped;
  });
}

export interface DealDetail {
  id: string;
  tenantId: string;
  dealCode: string;
  title: string;
  stage: DealStage;
  status: 'open' | 'won' | 'lost';
  estimatedValue: number | null;
  probabilityPercent: number | null;
  expectedCloseDate: string | null;
  source: 'inbound' | 'outbound' | 'referral' | 'repeat_business' | 'other';
  notes: string | null;
  hot: boolean;
  lostReason: string | null;
  lostReasonNote: string | null;
  createdAt: Date;
  lastActivityAt: Date;
  dealer: {
    id: string;
    name: string;
    legalName: string;
    state: string | null;
    gstin: string | null;
    riskLevel: 'low' | 'medium' | 'high';
  };
  assignee: {
    id: string;
    fullName: string;
    email: string;
  };
  products: Array<{
    id: string;
    productId: string;
    sku: string;
    name: string;
    estimatedQuantity: number;
    notes: string | null;
  }>;
  history: Array<{
    id: string;
    fromStage: DealStage | null;
    toStage: DealStage;
    fromStatus: 'open' | 'won' | 'lost' | null;
    toStatus: 'open' | 'won' | 'lost';
    transitionedAt: Date;
    automatic: boolean;
    overridden: boolean;
    reason: string | null;
    actorName: string | null;
  }>;
}

export async function getDealById(tenantId: string, dealId: string): Promise<DealDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [base] = await tx
      .select({
        id: deals.id,
        tenantId: deals.tenantId,
        dealCode: deals.dealCode,
        title: deals.title,
        stage: deals.stage,
        status: deals.status,
        estimatedValue: deals.estimatedValue,
        probabilityPercent: deals.probabilityPercent,
        expectedCloseDate: deals.expectedCloseDate,
        source: deals.source,
        notes: deals.notes,
        hot: deals.hot,
        lostReason: deals.lostReason,
        lostReasonNote: deals.lostReasonNote,
        createdAt: deals.createdAt,
        lastActivityAt: deals.lastActivityAt,
        dealerId: deals.dealerId,
        dealerName: dealers.displayName,
        dealerLegal: dealers.legalName,
        dealerState: dealers.state,
        dealerGstin: dealers.gstin,
        dealerRisk: dealers.riskLevel,
        assigneeId: deals.assignedTo,
        assigneeName: users.fullName,
        assigneeEmail: users.email,
      })
      .from(deals)
      .leftJoin(dealers, eq(dealers.id, deals.dealerId))
      .leftJoin(users, eq(users.id, deals.assignedTo))
      .where(eq(deals.id, dealId))
      .limit(1);
    if (!base) return null;

    const productRows = await tx
      .select({
        id: dealProducts.id,
        productId: dealProducts.productId,
        sku: products.sku,
        name: products.name,
        estimatedQuantity: dealProducts.estimatedQuantity,
        notes: dealProducts.notes,
      })
      .from(dealProducts)
      .leftJoin(products, eq(products.id, dealProducts.productId))
      .where(eq(dealProducts.dealId, dealId))
      .orderBy(asc(dealProducts.createdAt));

    const historyRows = await tx
      .select({
        id: dealStageHistory.id,
        fromStage: dealStageHistory.fromStage,
        toStage: dealStageHistory.toStage,
        fromStatus: dealStageHistory.fromStatus,
        toStatus: dealStageHistory.toStatus,
        transitionedAt: dealStageHistory.transitionedAt,
        automatic: dealStageHistory.automatic,
        overridden: dealStageHistory.overridden,
        reason: dealStageHistory.reason,
        actorId: dealStageHistory.transitionedBy,
      })
      .from(dealStageHistory)
      .where(eq(dealStageHistory.dealId, dealId))
      .orderBy(desc(dealStageHistory.transitionedAt))
      .limit(20);

    const actorIds = Array.from(
      new Set(historyRows.map((h) => h.actorId).filter((id): id is string => id !== null)),
    );
    let actorMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const actors = await tx
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, actorIds));
      actorMap = new Map(actors.map((a) => [a.id, a.name ?? '—']));
    }

    return {
      id: base.id,
      tenantId: base.tenantId,
      dealCode: base.dealCode,
      title: base.title,
      stage: base.stage,
      status: base.status,
      estimatedValue: base.estimatedValue != null ? Number(base.estimatedValue) : null,
      probabilityPercent: base.probabilityPercent,
      expectedCloseDate: base.expectedCloseDate,
      source: base.source,
      notes: base.notes,
      hot: base.hot,
      lostReason: base.lostReason,
      lostReasonNote: base.lostReasonNote,
      createdAt: base.createdAt,
      lastActivityAt: base.lastActivityAt,
      dealer: {
        id: base.dealerId,
        name: base.dealerName ?? '—',
        legalName: base.dealerLegal ?? '—',
        state: base.dealerState,
        gstin: base.dealerGstin,
        riskLevel: (base.dealerRisk ?? 'low') as 'low' | 'medium' | 'high',
      },
      assignee: {
        id: base.assigneeId,
        fullName: base.assigneeName ?? '—',
        email: base.assigneeEmail ?? '',
      },
      products: productRows.map((r) => ({
        id: r.id,
        productId: r.productId,
        sku: r.sku ?? '—',
        name: r.name ?? '—',
        estimatedQuantity: r.estimatedQuantity,
        notes: r.notes,
      })),
      history: historyRows.map((h) => ({
        id: h.id,
        fromStage: h.fromStage,
        toStage: h.toStage,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        transitionedAt: h.transitionedAt,
        automatic: h.automatic,
        overridden: h.overridden,
        reason: h.reason,
        actorName: h.actorId ? (actorMap.get(h.actorId) ?? null) : null,
      })),
    };
  });
}

export interface PipelineMetrics {
  total: number;
  totalValue: number;
  byStage: Array<{ stage: DealStage; count: number; value: number }>;
  hotCount: number;
  stalledCount: number;
  hotSample: Array<{
    id: string;
    title: string;
    estimatedValue: number | null;
    dealerName: string;
  }>;
  stalledSample: Array<{
    id: string;
    title: string;
    estimatedValue: number | null;
    dealerName: string;
    daysSinceActivity: number;
  }>;
}

const STALLED_THRESHOLD_DAYS = 14;

export async function getDealMetrics(tenantId: string): Promise<PipelineMetrics> {
  return withTenant(tenantId, async (tx) => {
    const stageRows = await tx
      .select({
        stage: deals.stage,
        count: sql<number>`count(*)::int`,
        value: sql<string>`coalesce(sum(${deals.estimatedValue}), 0)::text`,
      })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, 'open')))
      .groupBy(deals.stage);

    const ALL: DealStage[] = [
      'qualification',
      'needs_analysis',
      'quotation_sent',
      'negotiation',
      'verbal_commit',
      'po_pending',
      'payment_pending',
      'ready_for_dispatch',
      'closed',
    ];
    const byStage = ALL.map((s) => {
      const r = stageRows.find((x) => x.stage === s);
      return { stage: s, count: r?.count ?? 0, value: r ? Number(r.value) : 0 };
    });

    const total = byStage.reduce((sum, s) => sum + s.count, 0);
    const totalValue = byStage.reduce((sum, s) => sum + s.value, 0);

    const [hotAgg] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, 'open'), eq(deals.hot, true)));

    const stalledThreshold = new Date(Date.now() - STALLED_THRESHOLD_DAYS * 86400_000);
    const [stalledAgg] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, tenantId),
          eq(deals.status, 'open'),
          sql`${deals.lastActivityAt} < ${stalledThreshold}`,
        ),
      );

    const hotSample = await tx
      .select({
        id: deals.id,
        title: deals.title,
        estimatedValue: deals.estimatedValue,
        dealerName: dealers.displayName,
      })
      .from(deals)
      .leftJoin(dealers, eq(dealers.id, deals.dealerId))
      .where(and(eq(deals.tenantId, tenantId), eq(deals.status, 'open'), eq(deals.hot, true)))
      .orderBy(desc(deals.lastActivityAt))
      .limit(5);

    const stalledSampleRows = await tx
      .select({
        id: deals.id,
        title: deals.title,
        estimatedValue: deals.estimatedValue,
        dealerName: dealers.displayName,
        lastActivityAt: deals.lastActivityAt,
      })
      .from(deals)
      .leftJoin(dealers, eq(dealers.id, deals.dealerId))
      .where(
        and(
          eq(deals.tenantId, tenantId),
          eq(deals.status, 'open'),
          sql`${deals.lastActivityAt} < ${stalledThreshold}`,
        ),
      )
      .orderBy(asc(deals.lastActivityAt))
      .limit(5);

    const now = Date.now();

    return {
      total,
      totalValue,
      byStage,
      hotCount: hotAgg?.count ?? 0,
      stalledCount: stalledAgg?.count ?? 0,
      hotSample: hotSample.map((r) => ({
        id: r.id,
        title: r.title,
        estimatedValue: r.estimatedValue != null ? Number(r.estimatedValue) : null,
        dealerName: r.dealerName ?? '—',
      })),
      stalledSample: stalledSampleRows.map((r) => ({
        id: r.id,
        title: r.title,
        estimatedValue: r.estimatedValue != null ? Number(r.estimatedValue) : null,
        dealerName: r.dealerName ?? '—',
        daysSinceActivity: Math.max(1, Math.floor((now - r.lastActivityAt.getTime()) / 86400_000)),
      })),
    };
  });
}
