import {
  dealers,
  orders,
  paymentAllocations,
  payments,
  performaInvoices,
  users,
  withTenant,
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
        allocated: sql<string>`COALESCE((
          SELECT SUM(pa.amount) FROM payment_allocations pa
            JOIN payments p ON p.id = pa.payment_id
           WHERE pa.order_id = ${orders.id}
             AND p.status IN ('verified', 'cleared')
        ), 0)`,
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

    return rows.map((r) => {
      const total = Number(r.totalAmount);
      const allocated = Number(r.allocated);
      return {
        id: r.id,
        orderNumber: r.orderNumber,
        orderDate: r.orderDate,
        totalAmount: total,
        allocatedAmount: allocated,
        outstanding: Math.max(0, total - allocated),
      };
    });
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
