/**
 * Day 7 seed extension: 30 deals per tenant distributed across the 9
 * pipeline stages, with deal_products lines and a synthetic stage history.
 *
 * Distribution per CLAUDE.md §13: deals across all 9 stages, mixed
 * statuses (open/won/lost), some hot, some stalled.
 *
 * Run AFTER day5.ts (which creates dealers + products + sales users).
 * Re-runnable: truncates deals + deal_products + deal_stage_history first.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import {
  dealProducts,
  dealStageHistory,
  dealers,
  deals,
  products,
  tenants,
  users,
} from '../schema';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const STAGES = [
  'qualification',
  'needs_analysis',
  'quotation_sent',
  'negotiation',
  'verbal_commit',
  'po_pending',
  'payment_pending',
  'ready_for_dispatch',
  'closed',
] as const;
type Stage = (typeof STAGES)[number];

const SOURCES = ['inbound', 'outbound', 'referral', 'repeat_business', 'other'] as const;
const LOST_REASONS = ['price', 'competitor', 'timing', 'no_budget', 'other'] as const;

/**
 * Stage distribution per tenant — total = 30. Skewed towards the early
 * funnel where deals naturally accumulate. Closed deals split won/lost.
 */
const STAGE_COUNTS: Record<Stage, number> = {
  qualification: 6,
  needs_analysis: 5,
  quotation_sent: 4,
  negotiation: 4,
  verbal_commit: 2,
  po_pending: 2,
  payment_pending: 2,
  ready_for_dispatch: 2,
  closed: 3, // mix of won + lost
};

const DEAL_TITLES = [
  '120-panel commercial rooftop',
  '500 kW industrial array',
  'Residential phase-1 (Sec 47)',
  'Warehouse retrofit — Adani',
  'School rooftop solar — KMC',
  'Phase 2 expansion — Premier',
  'Hospital backup array',
  'Cold-storage solar pack',
  'Petrol pump canopy install',
  'Apartment block rooftop',
  'Telecom tower hybrid',
  'Factory floor expansion',
  'Off-grid farmhouse kit',
  'EV charging hub — 6 bays',
  'Logistics hub rooftop',
  'Mall canopy retrofit',
  'Bank branch network rollout',
  'Govt office solarisation',
  'University hostel rooftop',
  'Resort microgrid build',
];

function pick<T>(arr: readonly T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length]!;
}

interface DealerRow {
  id: string;
  riskLevel: 'low' | 'medium' | 'high';
}

interface ProductRow {
  id: string;
  defaultSellingPrice: string | null;
}

async function seedTenant(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  adminId: string | null,
  salesId: string | null,
  fiscalYear: number,
) {
  const dealerRows = (await db
    .select({ id: dealers.id, riskLevel: dealers.riskLevel })
    .from(dealers)) as DealerRow[];
  const productRows = (await db
    .select({ id: products.id, defaultSellingPrice: products.defaultSellingPrice })
    .from(products)) as ProductRow[];

  if (dealerRows.length === 0 || productRows.length === 0) {
    console.log('  · (no dealers or products — skipping)');
    return;
  }

  let createdCount = 0;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${adminId ?? ''}, true)`);

    for (const stage of STAGES) {
      const count = STAGE_COUNTS[stage];
      for (let i = 0; i < count; i++) {
        const seed = createdCount + 1;
        const dealer = pick(dealerRows, seed * 7);
        // For high-risk dealers, never seed them past Negotiation — the
        // guard would have blocked them in real life. Pick a low/medium
        // dealer instead.
        const stageNum = STAGES.indexOf(stage) + 1;
        const effectiveDealer =
          dealer.riskLevel === 'high' && stageNum > 4
            ? (dealerRows.find((d) => d.riskLevel !== 'high') ?? dealer)
            : dealer;

        // Pull next deal counter atomically.
        const counterRes = await tx.execute<{ last_value: string | number }>(sql`
          INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
          VALUES (${tenantId}, 'deal', ${fiscalYear}, 1)
          ON CONFLICT (tenant_id, doc_type, fiscal_year)
          DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
          RETURNING last_value
        `);
        const counterArr = counterRes as unknown as { last_value: string | number }[];
        const seq = Number(counterArr[0]!.last_value);
        const dealCode = `DEAL-${fiscalYear}-${String(seq).padStart(4, '0')}`;

        const status: 'open' | 'won' | 'lost' =
          stage === 'closed' ? (i % 2 === 0 ? 'won' : 'lost') : 'open';

        // Spread last activity: half the cards in the last 7d (fresh),
        // a few intentionally stalled at >14d to populate the dashboard.
        let activityDaysAgo = (seed * 3) % 30;
        const isStalled = createdCount % 7 === 6;
        if (isStalled) activityDaysAgo = 18 + (seed % 12);
        const lastActivityAt = new Date(Date.now() - activityDaysAgo * 86400_000);
        const createdAt = new Date(lastActivityAt.getTime() - 86400_000 * 5);

        const estValue = 250_000 + ((seed * 91_739) % 4_000_000);
        const probability =
          stage === 'qualification'
            ? 20
            : stage === 'needs_analysis'
              ? 30
              : stage === 'quotation_sent'
                ? 45
                : stage === 'negotiation'
                  ? 60
                  : stage === 'verbal_commit'
                    ? 75
                    : stage === 'po_pending'
                      ? 85
                      : stage === 'payment_pending'
                        ? 92
                        : stage === 'ready_for_dispatch'
                          ? 98
                          : status === 'won'
                            ? 100
                            : 0;
        const expectedClose = new Date(Date.now() + (15 + (seed % 60)) * 86400_000);

        const assignedTo = salesId ?? adminId ?? null;
        if (!assignedTo) continue;

        const lostReason = status === 'lost' ? pick(LOST_REASONS, seed * 13) : null;

        const [created] = await tx
          .insert(deals)
          .values({
            tenantId,
            dealCode,
            title: pick(DEAL_TITLES, seed * 11) + ` · ${dealCode.slice(-4)}`,
            dealerId: effectiveDealer.id,
            assignedTo,
            stage,
            status,
            estimatedValue: estValue.toFixed(2),
            probabilityPercent: probability,
            expectedCloseDate: expectedClose.toISOString().slice(0, 10),
            source: pick(SOURCES, seed * 17),
            hot: createdCount % 9 === 4,
            notes: null,
            lastActivityAt,
            createdAt,
            createdBy: adminId,
            updatedBy: adminId,
            lostReason,
            lostReasonNote: status === 'lost' ? 'Seeded sample lost deal' : null,
          })
          .returning({ id: deals.id });
        const dealId = created!.id;

        // 1-3 product lines per deal
        const lineCount = 1 + (seed % 3);
        for (let j = 0; j < lineCount; j++) {
          const prod = pick(productRows, seed * 19 + j * 5);
          await tx.insert(dealProducts).values({
            tenantId,
            dealId,
            productId: prod.id,
            estimatedQuantity: 10 + ((seed + j) % 90),
          });
        }

        // Stage history: a 'deal_created' row at qualification, then
        // synthetic transitions up to the current stage. Closed deals get
        // a final won/lost row.
        let cursor: Stage = 'qualification';
        const transitionedAtBase = createdAt.getTime();
        let step = 0;
        await tx.insert(dealStageHistory).values({
          tenantId,
          dealId,
          fromStage: null,
          toStage: 'qualification',
          fromStatus: null,
          toStatus: 'open',
          transitionedBy: adminId,
          transitionedAt: new Date(transitionedAtBase),
          automatic: false,
          overridden: false,
          reason: 'deal_created',
        });
        const targetIdx = STAGES.indexOf(stage);
        let idx = 0;
        while (idx < targetIdx) {
          idx++;
          step++;
          const to = STAGES[idx]!;
          const toStatusForStep: 'open' | 'won' | 'lost' = to === 'closed' ? status : 'open';
          await tx.insert(dealStageHistory).values({
            tenantId,
            dealId,
            fromStage: cursor,
            toStage: to,
            fromStatus: 'open',
            toStatus: toStatusForStep,
            transitionedBy: salesId ?? adminId,
            transitionedAt: new Date(transitionedAtBase + step * 86400_000),
            automatic: false,
            overridden: false,
            reason: null,
          });
          cursor = to;
        }

        createdCount++;
      }
    }
  });

  console.log(`  · ${createdCount} deals seeded`);
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Day 7 seed: deals + deal_products + deal_stage_history');

  await client.unsafe(`
    TRUNCATE TABLE
      deal_stage_history,
      deal_products,
      deals
    RESTART IDENTITY CASCADE;
  `);

  // Reset the deal counter so re-runs don't drift.
  await client.unsafe(`DELETE FROM document_counters WHERE doc_type = 'deal';`);

  const fiscalYear = 2026;
  const tenantRows = await db.select().from(tenants);
  for (const t of tenantRows) {
    if (t.status !== 'active') continue;
    console.log(`  · Tenant ${t.slug}`);
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'admin'`)
      .limit(1);
    const [sales] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'sales'`)
      .limit(1);
    await seedTenant(db, t.id, admin?.id ?? null, sales?.id ?? null, fiscalYear);
  }

  await client.end({ timeout: 5 });
  console.log('✓ Day 7 seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Day 7 seed failed:', err);
  process.exit(1);
});
