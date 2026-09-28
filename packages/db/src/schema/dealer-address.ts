import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { dealers } from './dealer';
import { tenants } from './tenant';
import { users } from './user';

/**
 * Delivery addresses belonging to a dealer — the multi-site case (F.5a).
 *
 * ## WHY THIS EXISTS
 *
 * A dealer carries ONE inline address today (`dealer.ts:50-56`), which is its
 * registered address and the thing every Ship-To derives its state from. That is
 * wrong for a dealer with more than one site: goods go to a warehouse, a project
 * site or a branch, and none of those need be in the state the dealer is
 * registered in. Until this table existed, a distributor could only express
 * "ship to this dealer", never "ship to that dealer's Pune warehouse".
 *
 * ## THE STATE IS SNAPSHOTTED ON THE DOCUMENT; THIS TABLE IS THE MASTER (D-5)
 *
 * A document does NOT read its place of supply from here at render time. The
 * state is captured on the document at issuance, beside `tenant_state_at_issue`,
 * for the reason `performa-invoice.ts` already states: "Tax-engine inputs
 * captured at issuance — never recomputed from masters". An address whose state
 * is later corrected must not retroactively change the tax classification of an
 * invoice that has already been issued.
 *
 * What a document keeps a REFERENCE to is the address TEXT, which is
 * presentation. How that reference is stored — an FK, a JSON snapshot, or both —
 * is deliberately NOT decided here: four future documents face the same question
 * (tax invoice, credit note, e-invoice, e-way bill) and D-5 rules that it be
 * settled once in `docs/STAGE_F_BUILD_v3.md` rather than per-document. Deciding
 * it for one document on one day is how four documents end up with three
 * conventions.
 *
 * ## SOFT-DELETED, AND `restrict` RATHER THAN `cascade` (D-2)
 *
 * `deletedAt` because a document may reference an address, and a hard delete
 * would either break a `restrict` FK or — worse under `cascade` — remove the
 * delivery address from an issued dispatch note. The dealer FK is `restrict` for
 * the same reason: deleting a dealer that has addresses should fail loudly.
 *
 * Note that CLAUDE.md §4's soft-delete rule is currently HALF implemented across
 * the codebase — `deleted_at` on `dealers` and `products` is filtered in six read
 * paths and written by nothing (F.127). This table follows the rule as written;
 * it does not fix that, and the same caveat applies: nothing yet writes
 * `deletedAt` here either.
 *
 * ## AUDITABLE (D-2)
 *
 * An address change moves where goods physically go, so it needs the same audit
 * trail as the dealer master. The trigger stanza lives beside `dealers` in
 * `triggers/audit-log.sql` — it is NOT automatic, and no pre-existing test would
 * have caught its absence (F.5a P-8), which is why `dealer-addresses.test.ts`
 * asserts the audit row directly.
 */
export const dealerAddresses = pgTable(
  'dealer_addresses',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: uuid()
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'restrict' }),

    /**
     * What the distributor calls this place — "Pune warehouse", "Site office".
     * Required, because a Ship-To picker listing three identical addresses is
     * unusable and the label is the only thing that distinguishes them.
     */
    label: text().notNull(),

    // The address itself. Line 1, city, state and pincode are REQUIRED here even
    // though they are nullable on `dealers`: a delivery address exists in order
    // to be delivered to, and `state` is a tax input. `dealers` can carry a
    // partial address because it is a contact record; this cannot.
    addressLine1: text().notNull(),
    addressLine2: text(),
    city: text().notNull(),
    state: text().notNull(),
    pincode: text().notNull(),
    country: text().notNull().default('IN'),

    contactPerson: text(),
    phone: text(),

    /**
     * The address offered first when this dealer is chosen as Ship-To. At most
     * one per dealer, enforced by a partial unique index below.
     *
     * NOT a fallback: a dealer with no default is a normal state (every dealer
     * has none until someone sets one), and the Ship-To picker must handle it.
     */
    isDefault: boolean().notNull().default(false),

    notes: text(),

    // Soft delete — see the docblock. Nothing writes this yet (F.127).
    deletedAt: timestamp({ withTimezone: true }),

    // CLAUDE.md §4 standard columns.
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    // tenant_id leads every composite index (CLAUDE.md §4).
    index('dealer_addresses_tenant_dealer_ix').on(t.tenantId, t.dealerId),
    index('dealer_addresses_tenant_state_ix').on(t.tenantId, t.state),
    /**
     * At most one default per dealer. Partial on `is_default` AND on
     * `deleted_at IS NULL`, so a soft-deleted default does not block naming a new
     * one — which it would under a plain unique index, and the failure would look
     * like a bug in the form rather than a deleted row.
     */
    uniqueIndex('dealer_addresses_one_default_uq')
      .on(t.tenantId, t.dealerId)
      .where(sql`${t.isDefault} AND ${t.deletedAt} IS NULL`),
    // ISO 3166-2:IN 2-letter code, matching dealers_state_chk (dealer.ts:109) —
    // except NOT NULL here, because a delivery address without a state cannot be
    // a Ship-To. CLAUDE.md §5: never store a full state name.
    check('dealer_addresses_state_chk', sql`${t.state} ~ '^[A-Z]{2}$'`),
    check('dealer_addresses_label_not_empty_chk', sql`btrim(${t.label}) <> ''`),
    check('dealer_addresses_line1_not_empty_chk', sql`btrim(${t.addressLine1}) <> ''`),
  ],
);

export type DealerAddress = typeof dealerAddresses.$inferSelect;
export type NewDealerAddress = typeof dealerAddresses.$inferInsert;
