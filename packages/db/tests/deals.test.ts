/**
 * Day 7 — pipeline stage state machine tests.
 *
 * Mirrors the pattern from inventory.test.ts: a suite of pure predicate
 * tests against transitions.ts plus DB-backed tests that exercise the
 * row-locking transitionStage() against the demo seed.
 */
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ALL_STAGES,
  ALLOWED_TRANSITIONS,
  DealNotFoundError,
  HighRiskGuardError,
  InvalidTransitionError,
  MissingLostReasonError,
  STAGE_NUMBER,
  allowedTargets,
  breachesHighRiskGuard,
  isAllowed,
  isForward,
  isReverse,
  transitionStage,
  type DealStage,
} from '../src/deals/transitions';
import * as schema from '../src/schema';
import { dealers, deals, products, tenants, users } from '../src/schema';
// products is referenced inside beforeAll to validate the seed; the
// lint rule for unused imports is the only consumer that misses this.
void products;
import type { DrizzleTx } from '../src/with-tenant';

const APP_DB_URL =
  process.env.APP_DATABASE_URL ??
  'postgresql://dealerlink_app:dev_app_password_change_me@localhost:5432/dealerlink_dev';

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle>;
let demoId: string;
let demoAdminId: string;
let demoLowRiskDealerId: string;
let demoHighRiskDealerId: string;

beforeAll(async () => {
  client = postgres(APP_DB_URL, { max: 4, prepare: false });
  db = drizzle(client, { schema, casing: 'snake_case' });

  const [d] = await db.select().from(tenants).where(eq(tenants.slug, 'demo'));
  if (!d) throw new Error('seed tenant "demo" missing — run pnpm db:seed');
  demoId = d.id;

  await asTenant(demoId, async (tx) => {
    const [admin] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${demoId} AND role = 'admin'`)
      .limit(1);
    if (!admin) throw new Error('demo admin missing');
    demoAdminId = admin.id;

    const [low] = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(sql`tenant_id = ${demoId} AND risk_level = 'low'`)
      .limit(1);
    if (!low) throw new Error('no low-risk dealer in demo seed');
    demoLowRiskDealerId = low.id;

    let high: { id: string } | undefined;
    [high] = await tx
      .select({ id: dealers.id })
      .from(dealers)
      .where(sql`tenant_id = ${demoId} AND risk_level = 'high'`)
      .limit(1);
    if (!high) {
      // No high-risk in seed; flip one of the medium-risk dealers for this test.
      const [med] = await tx
        .select({ id: dealers.id })
        .from(dealers)
        .where(sql`tenant_id = ${demoId} AND risk_level = 'medium'`)
        .limit(1);
      if (!med) throw new Error('no dealers in demo seed at all');
      await tx.update(dealers).set({ riskLevel: 'high' }).where(eq(dealers.id, med.id));
      high = { id: med.id };
    }
    demoHighRiskDealerId = high.id;

    const [p] = await tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.tenantId, demoId))
      .limit(1);
    if (!p) throw new Error('no products in demo seed');
  });
});

afterAll(async () => {
  await client.end({ timeout: 5 });
});

async function asTenant<T>(tenantId: string, fn: (tx: DrizzleTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${demoAdminId ?? ''}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);
    return fn(tx as unknown as DrizzleTx);
  });
}

async function createTestDeal(
  dealerId: string,
  stage: DealStage = 'qualification',
): Promise<string> {
  return asTenant(demoId, async (tx) => {
    const code = `TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const [row] = await tx
      .insert(deals)
      .values({
        tenantId: demoId,
        dealCode: code,
        title: `Test deal ${code}`,
        dealerId,
        assignedTo: demoAdminId,
        stage,
        status: 'open',
        createdBy: demoAdminId,
        updatedBy: demoAdminId,
      })
      .returning({ id: deals.id });
    return row!.id;
  });
}

// ---------------------------------------------------------------------------
// Pure predicates
// ---------------------------------------------------------------------------
describe('state machine — pure predicates', () => {
  it('STAGE_NUMBER follows BRD §3.4 numbering 1-9', () => {
    expect(STAGE_NUMBER.qualification).toBe(1);
    expect(STAGE_NUMBER.negotiation).toBe(4);
    expect(STAGE_NUMBER.closed).toBe(9);
  });

  it('ALL_STAGES contains the 9 canonical stages', () => {
    expect(ALL_STAGES).toHaveLength(9);
  });

  it('forward path qualification → ... → closed', () => {
    expect(isForward('qualification', 'needs_analysis')).toBe(true);
    expect(isForward('needs_analysis', 'quotation_sent')).toBe(true);
    expect(isForward('negotiation', 'verbal_commit')).toBe(true);
    expect(isForward('payment_pending', 'ready_for_dispatch')).toBe(true);
    expect(isForward('ready_for_dispatch', 'closed')).toBe(true);
  });

  it('reverse moves are reverse, not forward', () => {
    expect(isReverse('needs_analysis', 'qualification')).toBe(true);
    expect(isForward('needs_analysis', 'qualification')).toBe(false);
  });

  it('any stage may jump to closed (lost shortcut)', () => {
    for (const s of ALL_STAGES) {
      if (s === 'closed') continue;
      expect(isAllowed(s, 'closed')).toBe(true);
    }
  });

  it('closed is terminal — no transitions out', () => {
    expect(ALLOWED_TRANSITIONS.closed).toEqual([]);
  });

  it('forbids skipping forward by 2', () => {
    expect(isAllowed('qualification', 'quotation_sent')).toBe(false);
    expect(isAllowed('negotiation', 'po_pending')).toBe(false);
  });

  it('allowedTargets: sales sees forward only', () => {
    expect(allowedTargets('needs_analysis', 'sales')).toContain('quotation_sent');
    expect(allowedTargets('needs_analysis', 'sales')).not.toContain('qualification');
  });

  it('allowedTargets: admin sees forward + reverse', () => {
    const adminTargets = allowedTargets('needs_analysis', 'admin');
    expect(adminTargets).toContain('quotation_sent');
    expect(adminTargets).toContain('qualification');
  });
});

describe('high-risk guard predicate', () => {
  it('flags high-risk past negotiation', () => {
    expect(breachesHighRiskGuard('high', 'verbal_commit', 'open')).toBe(true);
    expect(breachesHighRiskGuard('high', 'po_pending', 'open')).toBe(true);
  });

  it('exempts closed-lost from the guard', () => {
    expect(breachesHighRiskGuard('high', 'closed', 'lost')).toBe(false);
    expect(breachesHighRiskGuard('high', 'closed', 'won')).toBe(true);
  });

  it('does not affect low/medium dealers', () => {
    expect(breachesHighRiskGuard('low', 'po_pending', 'open')).toBe(false);
    expect(breachesHighRiskGuard('medium', 'ready_for_dispatch', 'open')).toBe(false);
  });

  it('null risk level treated as not high', () => {
    expect(breachesHighRiskGuard(null, 'po_pending', 'open')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DB-backed transitionStage()
// ---------------------------------------------------------------------------
describe('transitionStage — DB-backed', () => {
  it('happy path qualification → needs_analysis (sales)', async () => {
    const id = await createTestDeal(demoLowRiskDealerId);
    await asTenant(demoId, async (tx) => {
      const result = await transitionStage(tx, id, 'needs_analysis', {
        role: 'sales',
        userId: demoAdminId,
      });
      expect(result.deal.stage).toBe('needs_analysis');
      expect(result.history.fromStage).toBe('qualification');
      expect(result.history.toStage).toBe('needs_analysis');
    });
  });

  it('rejects invalid skip qualification → quotation_sent', async () => {
    const id = await createTestDeal(demoLowRiskDealerId);
    await expect(
      asTenant(demoId, async (tx) => {
        await transitionStage(tx, id, 'quotation_sent', {
          role: 'sales',
          userId: demoAdminId,
        });
      }),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it('rejects reverse move for sales role', async () => {
    const id = await createTestDeal(demoLowRiskDealerId, 'needs_analysis');
    await expect(
      asTenant(demoId, async (tx) => {
        await transitionStage(tx, id, 'qualification', {
          role: 'sales',
          userId: demoAdminId,
        });
      }),
    ).rejects.toThrow(InvalidTransitionError);
  });

  it('admin can run reverse move', async () => {
    const id = await createTestDeal(demoLowRiskDealerId, 'needs_analysis');
    await asTenant(demoId, async (tx) => {
      const result = await transitionStage(tx, id, 'qualification', {
        role: 'admin',
        userId: demoAdminId,
      });
      expect(result.deal.stage).toBe('qualification');
    });
  });

  it('high-risk guard blocks sales past negotiation', async () => {
    const id = await createTestDeal(demoHighRiskDealerId, 'negotiation');
    await expect(
      asTenant(demoId, async (tx) => {
        await transitionStage(tx, id, 'verbal_commit', {
          role: 'sales',
          userId: demoAdminId,
        });
      }),
    ).rejects.toThrow(HighRiskGuardError);
  });

  it('high-risk guard blocks admin without override reason', async () => {
    const id = await createTestDeal(demoHighRiskDealerId, 'negotiation');
    await expect(
      asTenant(demoId, async (tx) => {
        await transitionStage(tx, id, 'verbal_commit', {
          role: 'admin',
          userId: demoAdminId,
        });
      }),
    ).rejects.toThrow(HighRiskGuardError);
  });

  it('high-risk guard permits admin with override reason and marks overridden', async () => {
    const id = await createTestDeal(demoHighRiskDealerId, 'negotiation');
    await asTenant(demoId, async (tx) => {
      const result = await transitionStage(tx, id, 'verbal_commit', {
        role: 'admin',
        userId: demoAdminId,
        override: { userId: demoAdminId, reason: 'Verbal commit verified with CFO' },
      });
      expect(result.deal.stage).toBe('verbal_commit');
      expect(result.history.overridden).toBe(true);
      expect(result.history.reason).toMatch(/CFO/);
    });
  });

  it('closing as lost requires a lost reason', async () => {
    const id = await createTestDeal(demoLowRiskDealerId, 'negotiation');
    await expect(
      asTenant(demoId, async (tx) => {
        await transitionStage(tx, id, 'closed', {
          role: 'sales',
          userId: demoAdminId,
          closeStatus: 'lost',
        });
      }),
    ).rejects.toThrow(MissingLostReasonError);
  });

  it('closing as lost with a reason persists lost_reason on the deal', async () => {
    const id = await createTestDeal(demoLowRiskDealerId, 'negotiation');
    await asTenant(demoId, async (tx) => {
      const result = await transitionStage(tx, id, 'closed', {
        role: 'sales',
        userId: demoAdminId,
        closeStatus: 'lost',
        lostReason: 'price',
        lostReasonNote: 'Lost on price competitiveness',
      });
      expect(result.deal.status).toBe('lost');
      expect(result.deal.lostReason).toBe('price');
    });
  });

  it('closing high-risk as lost bypasses guard (any stage)', async () => {
    const id = await createTestDeal(demoHighRiskDealerId, 'negotiation');
    await asTenant(demoId, async (tx) => {
      const result = await transitionStage(tx, id, 'closed', {
        role: 'sales',
        userId: demoAdminId,
        closeStatus: 'lost',
        lostReason: 'other',
      });
      expect(result.deal.status).toBe('lost');
    });
  });

  it('throws DealNotFoundError for an unknown id', async () => {
    await expect(
      asTenant(demoId, async (tx) => {
        await transitionStage(tx, '00000000-0000-0000-0000-000000000000', 'needs_analysis', {
          role: 'sales',
          userId: demoAdminId,
        });
      }),
    ).rejects.toThrow(DealNotFoundError);
  });

  it('idempotent guard: cannot transition to same stage', async () => {
    const id = await createTestDeal(demoLowRiskDealerId);
    await expect(
      asTenant(demoId, async (tx) => {
        await transitionStage(tx, id, 'qualification', {
          role: 'sales',
          userId: demoAdminId,
        });
      }),
    ).rejects.toThrow(InvalidTransitionError);
  });
});
