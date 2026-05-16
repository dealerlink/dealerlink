/**
 * Day 12 — payment lifecycle, allocation, and order paymentStatus propagation.
 *
 * Requires migrations + full seed (through day11). Tests run against the
 * RLS-enforcing `dealerlink_app` role. The allocation-validation logic itself
 * lives in the web Server Action; here we exercise the DB-layer primitives it
 * is built on — the state machine, the recompute helper, allocation reversal,
 * and the `FOR UPDATE` lock that serialises competing allocations.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { recomputeOrderPaymentStatus } from '../src/payments/recompute';
import {
  isPaymentTransitionAllowed,
  transitionPayment,
  PaymentInvalidTransitionError,
} from '../src/payments/transitions';
import * as schema from '../src/schema';
import {
  dealers,
  orderLines,
  orders,
  paymentAllocations,
  payments,
  performaInvoices,
  quotations,
  tenants,
  users,
} from '../src/schema';
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;
let sampleId: string;
let userId: string;
let dealerA: string;
let quotationId: string;

const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId || ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

/** Insert a payment for the demo tenant; returns its id. */
async function makePayment(tx: DrizzleTx, amount: string, status = 'pending_verification') {
  const [p] = await tx
    .insert(payments)
    .values({
      tenantId: demoId,
      paymentNumber: `PAY-TEST-${uniq()}`,
      dealerId: dealerA,
      amount,
      method: 'bank_transfer',
      receivedDate: '2026-05-01',
      status,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: payments.id });
  return p!.id;
}

/** Insert a confirmed order with the given total for the demo tenant. */
async function makeOrder(tx: DrizzleTx, total: string): Promise<string> {
  const [pi] = await tx
    .insert(performaInvoices)
    .values({
      tenantId: demoId,
      piNumber: `PI-PAYTEST-${uniq()}`,
      quotationId,
      billToDealerId: dealerA,
      shipToDealerId: dealerA,
      tenantStateAtIssue: 'MAHARASHTRA',
      placeOfSupply: 'MAHARASHTRA',
      preparedBy: userId,
      validUntil: '2027-01-01',
      subtotal: total,
      taxableAmount: total,
      totalAmount: total,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: performaInvoices.id });
  const [order] = await tx
    .insert(orders)
    .values({
      tenantId: demoId,
      orderNumber: `ORD-PAYTEST-${uniq()}`,
      performaInvoiceId: pi!.id,
      quotationId,
      billToDealerId: dealerA,
      shipToDealerId: dealerA,
      tenantStateAtIssue: 'MAHARASHTRA',
      placeOfSupply: 'MAHARASHTRA',
      subtotal: total,
      taxableAmount: total,
      totalAmount: total,
      status: 'confirmed',
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: orders.id });
  await tx.insert(orderLines).values({
    tenantId: demoId,
    orderId: order!.id,
    lineNumber: 1,
    productId: (await tx.select({ id: schema.products.id }).from(schema.products).limit(1))[0]!.id,
    productSku: 'PAYTEST-SKU',
    productName: 'Pay Test Panel',
    hsnCode: '85414011',
    quantity: '1.000',
    unitPrice: total,
    gstRate: '18.00',
    lineTotal: total,
  });
  return order!.id;
}

/** Insert an allocation row and bump the payment's denormalised total. */
async function allocate(
  tx: DrizzleTx,
  paymentId: string,
  orderId: string,
  amount: string,
): Promise<void> {
  await tx.insert(paymentAllocations).values({
    tenantId: demoId,
    paymentId,
    orderId,
    amount,
    allocatedBy: userId,
  });
  await tx
    .update(payments)
    .set({ allocatedAmount: sql`${payments.allocatedAmount} + ${amount}` })
    .where(eq(payments.id, paymentId));
}

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 6, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });
  const [d] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  const [s] = await db.select().from(tenants).where(eq(tenants.slug, 'sample'));
  if (!d || !s) throw new Error('seed tenants missing — run pnpm db:seed');
  demoId = d.id;
  sampleId = s.id;

  await asTenant(demoId, async (tx) => {
    const [u] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.tenantId, demoId))
      .limit(1);
    userId = u!.id;
    const [dl] = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(eq(dealers.tenantId, demoId))
      .limit(1);
    dealerA = dl!.id;
    const [q] = await tx
      .select({ id: quotations.id })
      .from(quotations)
      .where(eq(quotations.tenantId, demoId))
      .limit(1);
    quotationId = q!.id;
  });
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

describe('payment state machine — pure isPaymentTransitionAllowed()', () => {
  it('allows pending_verification → verified → cleared → refunded', () => {
    expect(isPaymentTransitionAllowed('pending_verification', 'verified')).toBe(true);
    expect(isPaymentTransitionAllowed('verified', 'cleared')).toBe(true);
    expect(isPaymentTransitionAllowed('cleared', 'refunded')).toBe(true);
  });
  it('allows verified → bounced', () => {
    expect(isPaymentTransitionAllowed('verified', 'bounced')).toBe(true);
  });
  it('forbids pending_verification → cleared (must verify first)', () => {
    expect(isPaymentTransitionAllowed('pending_verification', 'cleared')).toBe(false);
  });
  it('forbids cleared → bounced and any → pending_verification', () => {
    expect(isPaymentTransitionAllowed('cleared', 'bounced')).toBe(false);
    expect(isPaymentTransitionAllowed('verified', 'pending_verification')).toBe(false);
  });
  it('forbids bounced/refunded → anything (terminal)', () => {
    for (const t of ['verified', 'cleared', 'refunded'] as const) {
      expect(isPaymentTransitionAllowed('bounced', t)).toBe(false);
      expect(isPaymentTransitionAllowed('refunded', t)).toBe(false);
    }
  });
});

describe('transitionPayment() — DB-backed', () => {
  it('moves pending → verified → cleared and stamps timestamps', async () => {
    await asTenant(demoId, async (tx) => {
      const id = await makePayment(tx, '5000.00');
      const verified = await transitionPayment(tx, id, 'verified', { userId });
      expect(verified.status).toBe('verified');
      expect(verified.verifiedAt).not.toBeNull();
      expect(verified.verifiedBy).toBe(userId);
      const cleared = await transitionPayment(tx, id, 'cleared', { userId });
      expect(cleared.status).toBe('cleared');
      expect(cleared.clearedAt).not.toBeNull();
    });
  });

  it('captures a reason on bounce', async () => {
    await asTenant(demoId, async (tx) => {
      const id = await makePayment(tx, '5000.00');
      await transitionPayment(tx, id, 'verified', { userId });
      const bounced = await transitionPayment(tx, id, 'bounced', {
        userId,
        reason: 'cheque returned — insufficient funds',
      });
      expect(bounced.status).toBe('bounced');
      expect(bounced.bouncedReason).toContain('insufficient funds');
    });
  });

  it('throws PaymentInvalidTransitionError on pending → cleared', async () => {
    await expect(
      asTenant(demoId, async (tx) => {
        const id = await makePayment(tx, '1000.00');
        return transitionPayment(tx, id, 'cleared', { userId });
      }),
    ).rejects.toBeInstanceOf(PaymentInvalidTransitionError);
  });
});

describe('recomputeOrderPaymentStatus() — propagation', () => {
  it('0 allocated → unpaid, partial → partially_paid, exact → paid', async () => {
    await asTenant(demoId, async (tx) => {
      const orderId = await makeOrder(tx, '10000.00');
      const r0 = await recomputeOrderPaymentStatus(tx, orderId, userId);
      expect(r0.toStatus).toBe('unpaid');

      const payId = await makePayment(tx, '10000.00', 'verified');
      await allocate(tx, payId, orderId, '4000.00');
      const r1 = await recomputeOrderPaymentStatus(tx, orderId, userId);
      expect(r1.toStatus).toBe('partially_paid');

      await allocate(tx, payId, orderId, '6000.00');
      const r2 = await recomputeOrderPaymentStatus(tx, orderId, userId);
      expect(r2.toStatus).toBe('paid');
    });
  });

  it('over-allocation clamps to paid (not an error)', async () => {
    await asTenant(demoId, async (tx) => {
      const orderId = await makeOrder(tx, '1000.00');
      const payId = await makePayment(tx, '5000.00', 'verified');
      await allocate(tx, payId, orderId, '5000.00');
      const r = await recomputeOrderPaymentStatus(tx, orderId, userId);
      expect(r.toStatus).toBe('paid');
    });
  });

  it('pending-verification payments do not count toward paymentStatus', async () => {
    await asTenant(demoId, async (tx) => {
      const orderId = await makeOrder(tx, '2000.00');
      const payId = await makePayment(tx, '2000.00', 'pending_verification');
      await allocate(tx, payId, orderId, '2000.00');
      const r = await recomputeOrderPaymentStatus(tx, orderId, userId);
      expect(r.toStatus).toBe('unpaid');
    });
  });
});

describe('bounce reversal — allocations deleted, order regresses', () => {
  it('a bounced payment reverses its allocations and the order returns to unpaid', async () => {
    await asTenant(demoId, async (tx) => {
      const orderId = await makeOrder(tx, '8000.00');
      const payId = await makePayment(tx, '8000.00', 'verified');
      await allocate(tx, payId, orderId, '8000.00');
      const paid = await recomputeOrderPaymentStatus(tx, orderId, userId);
      expect(paid.toStatus).toBe('paid');

      // Bounce: transition + reverse allocations (what markPaymentBounced does).
      await transitionPayment(tx, payId, 'bounced', { userId, reason: 'bounced (seed)' });
      await tx.delete(paymentAllocations).where(eq(paymentAllocations.paymentId, payId));
      const regressed = await recomputeOrderPaymentStatus(tx, orderId, userId);
      expect(regressed.toStatus).toBe('unpaid');
      expect(regressed.changed).toBe(true);
    });
  });
});

describe('concurrent allocation — FOR UPDATE serialises competing operators', () => {
  it('two operators racing to spend the same ₹100k: one wins, one is rejected', async () => {
    // Two confirmed orders + a single ₹100k payment.
    let payId = '';
    let orderX = '';
    let orderY = '';
    await asTenant(demoId, async (tx) => {
      payId = await makePayment(tx, '100000.00', 'verified');
      orderX = await makeOrder(tx, '100000.00');
      orderY = await makeOrder(tx, '100000.00');
    });

    // Mirrors allocatePayment: lock the payment FOR UPDATE, read the
    // unallocated headroom, reject if the request exceeds it, else allocate.
    const tryAllocate = (orderId: string) =>
      asTenant(demoId, async (tx) => {
        const locked = await tx.execute<{ amount: string; allocated_amount: string }>(
          sql`SELECT amount, allocated_amount FROM payments WHERE id = ${payId} FOR UPDATE`,
        );
        const row = (locked as unknown as { amount: string; allocated_amount: string }[])[0]!;
        const unallocated = Number(row.amount) - Number(row.allocated_amount);
        if (unallocated < 100000) {
          throw new Error('payment fully allocated');
        }
        await allocate(tx, payId, orderId, '100000.00');
        return orderId;
      });

    const results = await Promise.allSettled([tryAllocate(orderX), tryAllocate(orderY)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain('fully allocated');

    // The denormalised total never exceeds the payment amount.
    const [final] = await asTenant(demoId, (tx) =>
      tx
        .select({ allocated: payments.allocatedAmount, amount: payments.amount })
        .from(payments)
        .where(eq(payments.id, payId)),
    );
    expect(Number(final!.allocated)).toBeLessThanOrEqual(Number(final!.amount));
  });
});

describe('RLS — payments + payment_allocations', () => {
  it('both tables have RLS enabled + forced', async () => {
    for (const table of ['payments', 'payment_allocations']) {
      const [row] = await db.execute(
        sql`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ${table}`,
      );
      const r = row as { relrowsecurity: boolean; relforcerowsecurity: boolean };
      expect(r.relrowsecurity, table).toBe(true);
      expect(r.relforcerowsecurity, table).toBe(true);
    }
  });

  it('demo cannot read sample-tenant payments', async () => {
    const visible = await asTenant(demoId, (tx) =>
      tx.select({ id: payments.id }).from(payments).where(eq(payments.tenantId, sampleId)),
    );
    expect(visible).toHaveLength(0);
  });
});
