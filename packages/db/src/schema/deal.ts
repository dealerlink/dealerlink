import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dealers } from './dealer';
import { products } from './product';
import { tenants } from './tenant';
import { users } from './user';

export const dealStage = pgEnum('deal_stage', [
  'qualification',
  'needs_analysis',
  'quotation_sent',
  'negotiation',
  'verbal_commit',
  'po_pending',
  'payment_pending',
  'ready_for_dispatch',
  'closed',
]);

export const dealStatus = pgEnum('deal_status', ['open', 'won', 'lost']);

export const dealSource = pgEnum('deal_source', [
  'inbound',
  'outbound',
  'referral',
  'repeat_business',
  'other',
]);

export const dealLostReason = pgEnum('deal_lost_reason', [
  'price',
  'competitor',
  'timing',
  'no_budget',
  'other',
]);

export const deals = pgTable(
  'deals',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),

    dealCode: text().notNull(),
    title: text().notNull(),

    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),
    assignedTo: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    stage: dealStage().notNull().default('qualification'),
    status: dealStatus().notNull().default('open'),

    estimatedValue: decimal({ precision: 12, scale: 2 }),
    probabilityPercent: integer(),
    expectedCloseDate: date(),

    source: dealSource().notNull().default('outbound'),

    lostReason: dealLostReason(),
    lostReasonNote: text(),

    notes: text(),
    hot: boolean().notNull().default(false),

    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('deals_tenant_code_uq').on(t.tenantId, t.dealCode),
    index('deals_tenant_stage_status_ix').on(t.tenantId, t.stage, t.status),
    index('deals_tenant_assigned_stage_ix').on(t.tenantId, t.assignedTo, t.stage),
    index('deals_tenant_hot_ix')
      .on(t.tenantId)
      .where(sql`${t.hot} = true`),
    index('deals_tenant_activity_ix').on(t.tenantId, t.lastActivityAt),
    index('deals_tenant_dealer_ix').on(t.tenantId, t.dealerId),
    check(
      'deals_probability_chk',
      sql`${t.probabilityPercent} IS NULL OR (${t.probabilityPercent} >= 0 AND ${t.probabilityPercent} <= 100)`,
    ),
    check(
      'deals_estimated_value_chk',
      sql`${t.estimatedValue} IS NULL OR ${t.estimatedValue} >= 0`,
    ),
    check(
      'deals_closed_status_chk',
      sql`(${t.stage} <> 'closed') OR (${t.status} IN ('won', 'lost'))`,
    ),
    check('deals_open_status_chk', sql`(${t.stage} = 'closed') OR (${t.status} = 'open')`),
    check('deals_lost_reason_chk', sql`(${t.status} <> 'lost') OR (${t.lostReason} IS NOT NULL)`),
  ],
);

export const dealProducts = pgTable(
  'deal_products',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dealId: uuid()
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),

    estimatedQuantity: integer().notNull().default(1),
    notes: text(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('deal_products_tenant_deal_ix').on(t.tenantId, t.dealId),
    index('deal_products_tenant_product_ix').on(t.tenantId, t.productId),
    check('deal_products_qty_chk', sql`${t.estimatedQuantity} > 0`),
  ],
);

export const dealStageHistory = pgTable(
  'deal_stage_history',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dealId: uuid()
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),

    fromStage: dealStage(),
    toStage: dealStage().notNull(),
    fromStatus: dealStatus(),
    toStatus: dealStatus().notNull(),

    transitionedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    transitionedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),

    automatic: boolean().notNull().default(false),
    overridden: boolean().notNull().default(false),
    reason: text(),
  },
  (t) => [
    index('deal_stage_history_tenant_deal_ix').on(t.tenantId, t.dealId, t.transitionedAt),
    index('deal_stage_history_tenant_at_ix').on(t.tenantId, t.transitionedAt),
  ],
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
export type DealProduct = typeof dealProducts.$inferSelect;
export type NewDealProduct = typeof dealProducts.$inferInsert;
export type DealStageHistory = typeof dealStageHistory.$inferSelect;
export type NewDealStageHistory = typeof dealStageHistory.$inferInsert;
