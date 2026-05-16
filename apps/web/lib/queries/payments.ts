import {
  dealers,
  orders,
  paymentAllocations,
  payments,
  performaInvoices,
  tenantSettings,
  users,
  withTenant,
  type DrizzleTx,
  type PaymentMethod,
  type PaymentStatus,
} from '@dealerlink/db';
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, ne, sql } from 'drizzle-orm';

export interface DealerOption {
  id: string;
  name: string;
}

/** Active dealers for the record-payment / filter dropdowns. */
export async function listDealerOptions(tenantId: string): Promise<DealerOption[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({ id: dealers.id, name: dealers.displayName })
      .from(dealers)
      .where(and(eq(dealers.status, 'active'), sql`${dealers.deletedAt} IS NULL`))
      .orderBy(asc(dealers.displayName));
    return rows.map((r) => ({ id: r.id, name: r.name }));
  });
}

export interface PaymentListRow {
  id: string;
  paymentNumber: string;
  receivedDate: string;
  dealerName: string;
  amount: number;
  allocatedAmount: number;
  method: PaymentMethod;
  status: PaymentStatus;
}

export async function listPayments(
  tenantId: string,
  filter: {
    status?: PaymentStatus[] | undefined;
    method?: PaymentMethod[] | undefined;
    dealerId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    search?: string | undefined;
  },
  opts: { limit?: number; offset?: number } = {},
): Promise<{ rows: PaymentListRow[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  return withTenant(tenantId, async (tx) => {
    const where = [eq(payments.tenantId, tenantId)];
    if (filter.status && filter.status.length > 0) {
      where.push(inArray(payments.status, filter.status));
    }
    if (filter.method && filter.method.length > 0) {
      where.push(inArray(payments.method, filter.method));
    }
    if (filter.dealerId) where.push(eq(payments.dealerId, filter.dealerId));
    if (filter.from) where.push(gte(payments.receivedDate, filter.from));
    if (filter.to) where.push(lte(payments.receivedDate, filter.to));
    if (filter.search && filter.search.trim().length > 0) {
      where.push(ilike(payments.paymentNumber, `%${filter.search.trim()}%`));
    }

    const rows = await tx
      .select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        receivedDate: payments.receivedDate,
        dealerName: dealers.displayName,
        amount: payments.amount,
        allocatedAmount: payments.allocatedAmount,
        method: payments.method,
        status: payments.status,
      })
      .from(payments)
      .leftJoin(dealers, eq(dealers.id, payments.dealerId))
      .where(and(...where))
      .orderBy(desc(payments.receivedDate), desc(payments.createdAt))
      .limit(limit)
      .offset(offset);

    const [agg] = await tx
      .select({ total: count() })
      .from(payments)
      .where(and(...where));

    return {
      rows: rows.map((r) => ({
        id: r.id,
        paymentNumber: r.paymentNumber,
        receivedDate: r.receivedDate,
        dealerName: r.dealerName ?? '—',
        amount: Number(r.amount),
        allocatedAmount: Number(r.allocatedAmount),
        method: r.method as PaymentMethod,
        status: r.status as PaymentStatus,
      })),
      total: agg?.total ?? 0,
    };
  });
}

export interface PaymentAllocationView {
  id: string;
  documentLabel: 'Order' | 'Proforma Invoice';
  documentId: string;
  documentNumber: string;
  amount: number;
  allocatedAt: Date;
  allocatedByName: string | null;
  notes: string | null;
}

export interface PaymentDetail {
  id: string;
  tenantId: string;
  paymentNumber: string;
  dealerId: string;
  dealerName: string;
  dealerEmail: string | null;
  amount: number;
  allocatedAmount: number;
  unallocatedAmount: number;
  currency: string;
  method: PaymentMethod;
  reference: string | null;
  receivedDate: string;
  depositedToBank: string | null;
  depositedDate: string | null;
  status: PaymentStatus;
  verifiedAt: Date | null;
  clearedAt: Date | null;
  bouncedAt: Date | null;
  bouncedReason: string | null;
  refundedAt: Date | null;
  refundedReason: string | null;
  notes: string | null;
  createdAt: Date;
  allocations: PaymentAllocationView[];
}

export async function getPaymentById(
  tenantId: string,
  paymentId: string,
): Promise<PaymentDetail | null> {
  return withTenant(tenantId, async (tx) => {
    const [base] = await tx
      .select({
        payment: payments,
        dealerName: dealers.displayName,
        dealerEmail: dealers.email,
      })
      .from(payments)
      .leftJoin(dealers, eq(dealers.id, payments.dealerId))
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!base) return null;
    const p = base.payment;

    const allocRows = await tx
      .select({
        id: paymentAllocations.id,
        orderId: paymentAllocations.orderId,
        performaInvoiceId: paymentAllocations.performaInvoiceId,
        amount: paymentAllocations.amount,
        allocatedAt: paymentAllocations.allocatedAt,
        allocatedBy: paymentAllocations.allocatedBy,
        notes: paymentAllocations.notes,
        orderNumber: orders.orderNumber,
        piNumber: performaInvoices.piNumber,
      })
      .from(paymentAllocations)
      .leftJoin(orders, eq(orders.id, paymentAllocations.orderId))
      .leftJoin(performaInvoices, eq(performaInvoices.id, paymentAllocations.performaInvoiceId))
      .where(eq(paymentAllocations.paymentId, paymentId))
      .orderBy(asc(paymentAllocations.allocatedAt));

    const actorIds = Array.from(new Set(allocRows.map((a) => a.allocatedBy)));
    let actorMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const actors = await tx
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, actorIds));
      actorMap = new Map(actors.map((a) => [a.id, a.name ?? '—']));
    }

    const amount = Number(p.amount);
    const allocated = Number(p.allocatedAmount);

    return {
      id: p.id,
      tenantId: p.tenantId,
      paymentNumber: p.paymentNumber,
      dealerId: p.dealerId,
      dealerName: base.dealerName ?? '—',
      dealerEmail: base.dealerEmail,
      amount,
      allocatedAmount: allocated,
      unallocatedAmount: Math.max(0, amount - allocated),
      currency: p.currency,
      method: p.method as PaymentMethod,
      reference: p.reference,
      receivedDate: p.receivedDate,
      depositedToBank: p.depositedToBank,
      depositedDate: p.depositedDate,
      status: p.status as PaymentStatus,
      verifiedAt: p.verifiedAt,
      clearedAt: p.clearedAt,
      bouncedAt: p.bouncedAt,
      bouncedReason: p.bouncedReason,
      refundedAt: p.refundedAt,
      refundedReason: p.refundedReason,
      notes: p.notes,
      createdAt: p.createdAt,
      allocations: allocRows.map((a) => ({
        id: a.id,
        documentLabel: a.orderId ? ('Order' as const) : ('Proforma Invoice' as const),
        documentId: a.orderId ?? a.performaInvoiceId ?? '',
        documentNumber: a.orderNumber ?? a.piNumber ?? '—',
        amount: Number(a.amount),
        allocatedAt: a.allocatedAt,
        allocatedByName: actorMap.get(a.allocatedBy) ?? null,
        notes: a.notes,
      })),
    };
  });
}

export interface OutstandingOrderRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  allocatedAmount: number;
  outstanding: number;
}

/**
 * Sum of verified/cleared allocations per order id. A single grouped query —
 * no correlated subquery, so every column stays unambiguously qualified.
 */
async function allocatedByOrder(tx: DrizzleTx, orderIds: string[]): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const rows = await tx
    .select({
      orderId: paymentAllocations.orderId,
      total: sql<string>`SUM(${paymentAllocations.amount})`,
    })
    .from(paymentAllocations)
    .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
    .where(
      and(
        inArray(paymentAllocations.orderId, orderIds),
        inArray(payments.status, ['verified', 'cleared']),
      ),
    )
    .groupBy(paymentAllocations.orderId);
  return new Map(rows.filter((r) => r.orderId).map((r) => [r.orderId!, Number(r.total)]));
}

/**
 * Orders of a dealer that still owe money — for the allocation modal. Returns
 * unpaid / partially-paid, non-cancelled orders with the outstanding balance
 * (total − allocations from verified/cleared payments).
 */
export async function getDealerOutstandingOrders(
  tenantId: string,
  dealerId: string,
): Promise<OutstandingOrderRow[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .where(
        and(
          eq(orders.billToDealerId, dealerId),
          ne(orders.status, 'cancelled'),
          inArray(orders.paymentStatus, ['unpaid', 'partially_paid']),
        ),
      )
      .orderBy(asc(orders.orderDate));

    const allocated = await allocatedByOrder(
      tx,
      rows.map((r) => r.id),
    );

    return rows.map((r) => {
      const total = Number(r.totalAmount);
      const alloc = allocated.get(r.id) ?? 0;
      return {
        id: r.id,
        orderNumber: r.orderNumber,
        orderDate: r.orderDate,
        totalAmount: total,
        allocatedAmount: alloc,
        outstanding: Math.max(0, total - alloc),
      };
    });
  });
}

export interface OverdueOrderRow {
  id: string;
  orderNumber: string;
  orderDate: string;
  dealerName: string;
  creditPeriodDays: number;
  dueDate: string;
  daysOverdue: number;
  outstanding: number;
}

/**
 * Orders whose payment is past the dealer's credit period. The due date is
 * `orderDate + creditPeriodDays` (dealer credit period, falling back to the
 * tenant default). Only unpaid / partially-paid, non-cancelled orders count.
 */
export async function getOverdueOrders(tenantId: string): Promise<OverdueOrderRow[]> {
  return withTenant(tenantId, async (tx) => {
    const [settings] = await tx
      .select({ defaultCreditPeriod: tenantSettings.defaultCreditPeriod })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId))
      .limit(1);
    const tenantDefault = settings?.defaultCreditPeriod ?? 30;

    const rows = await tx
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        orderDate: orders.orderDate,
        totalAmount: orders.totalAmount,
        dealerName: dealers.displayName,
        creditPeriodDays: dealers.creditPeriodDays,
      })
      .from(orders)
      .leftJoin(dealers, eq(dealers.id, orders.billToDealerId))
      .where(
        and(
          ne(orders.status, 'cancelled'),
          inArray(orders.paymentStatus, ['unpaid', 'partially_paid']),
        ),
      );

    const allocated = await allocatedByOrder(
      tx,
      rows.map((r) => r.id),
    );
    const now = Date.now();
    const overdue: OverdueOrderRow[] = [];
    for (const r of rows) {
      const creditPeriod = r.creditPeriodDays ?? tenantDefault;
      const due = new Date(`${r.orderDate}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + creditPeriod);
      const daysOverdue = Math.floor((now - due.getTime()) / 86_400_000);
      if (daysOverdue <= 0) continue;
      overdue.push({
        id: r.id,
        orderNumber: r.orderNumber,
        orderDate: r.orderDate,
        dealerName: r.dealerName ?? '—',
        creditPeriodDays: creditPeriod,
        dueDate: due.toISOString().slice(0, 10),
        daysOverdue,
        outstanding: Math.max(0, Number(r.totalAmount) - (allocated.get(r.id) ?? 0)),
      });
    }
    overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
    return overdue;
  });
}

export interface PaymentDashboard {
  overdueCount: number;
  overdueOutstanding: number;
  recentPayments: Array<{
    id: string;
    paymentNumber: string;
    dealerName: string;
    amount: number;
    receivedDate: string;
  }>;
  unallocatedCount: number;
}

/** Roll-up for the dashboard payment widgets. */
export async function getPaymentDashboard(tenantId: string): Promise<PaymentDashboard> {
  const overdue = await getOverdueOrders(tenantId);
  return withTenant(tenantId, async (tx) => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const recent = await tx
      .select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        dealerName: dealers.displayName,
        amount: payments.amount,
        receivedDate: payments.receivedDate,
      })
      .from(payments)
      .leftJoin(dealers, eq(dealers.id, payments.dealerId))
      .where(gte(payments.receivedDate, sevenDaysAgo))
      .orderBy(desc(payments.receivedDate), desc(payments.createdAt))
      .limit(8);

    const [unalloc] = await tx
      .select({ n: count() })
      .from(payments)
      .where(
        and(
          inArray(payments.status, ['verified', 'cleared']),
          sql`${payments.allocatedAmount} < ${payments.amount}`,
        ),
      );

    return {
      overdueCount: overdue.length,
      overdueOutstanding: overdue.reduce((s, o) => s + o.outstanding, 0),
      recentPayments: recent.map((r) => ({
        id: r.id,
        paymentNumber: r.paymentNumber,
        dealerName: r.dealerName ?? '—',
        amount: Number(r.amount),
        receivedDate: r.receivedDate,
      })),
      unallocatedCount: unalloc?.n ?? 0,
    };
  });
}

export interface OrderPaymentRow {
  allocationId: string;
  paymentId: string;
  paymentNumber: string;
  paymentStatus: PaymentStatus;
  amount: number;
  allocatedAt: Date;
  allocatedByName: string | null;
}

/** Allocations recorded against a single order — for the order Payments tab. */
export async function getOrderPayments(
  tenantId: string,
  orderId: string,
): Promise<{ rows: OrderPaymentRow[]; totalPaid: number }> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        allocationId: paymentAllocations.id,
        paymentId: payments.id,
        paymentNumber: payments.paymentNumber,
        paymentStatus: payments.status,
        amount: paymentAllocations.amount,
        allocatedAt: paymentAllocations.allocatedAt,
        allocatedBy: paymentAllocations.allocatedBy,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(eq(paymentAllocations.orderId, orderId))
      .orderBy(desc(paymentAllocations.allocatedAt));

    const actorIds = Array.from(new Set(rows.map((r) => r.allocatedBy)));
    let actorMap = new Map<string, string>();
    if (actorIds.length > 0) {
      const actors = await tx
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, actorIds));
      actorMap = new Map(actors.map((a) => [a.id, a.name ?? '—']));
    }

    // Only verified/cleared payments count toward the paid total.
    let totalPaid = 0;
    const mapped = rows.map((r) => {
      const amt = Number(r.amount);
      if (r.paymentStatus === 'verified' || r.paymentStatus === 'cleared') totalPaid += amt;
      return {
        allocationId: r.allocationId,
        paymentId: r.paymentId,
        paymentNumber: r.paymentNumber,
        paymentStatus: r.paymentStatus as PaymentStatus,
        amount: amt,
        allocatedAt: r.allocatedAt,
        allocatedByName: actorMap.get(r.allocatedBy) ?? null,
      };
    });
    return { rows: mapped, totalPaid };
  });
}
