import { sql } from 'drizzle-orm';
import {
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
import { orders } from './order';
import { products } from './product';
import { tenants } from './tenant';
import { users } from './user';

/**
 * Tax invoice, credit note and debit note lifecycle — TWO states, deliberately.
 *
 * ## CANCELLATION IS NOT THE CORRECTION MECHANISM, AND THIS MATTERS MORE THAN THE
 * ## STATE COUNT
 *
 * A **cancelled** invoice is one that SHOULD NEVER HAVE EXISTED: a mis-keyed
 * number, a duplicate issue, a document raised against the wrong order. It is not
 * how a wrong amount is put right.
 *
 * **A wrong amount is corrected by a CREDIT NOTE.** Under GST an issued invoice is
 * immutable and the credit note is the statutory correction instrument; cancelling
 * an invoice because its total was wrong removes the document from the trail while
 * leaving the supply itself unaccounted for, so the GST position and the document
 * trail diverge.
 *
 * This is written here because `cancel` is the control closer to hand. Without the
 * distinction stated at the schema, the next person reaching for a correction
 * reaches for cancellation, and nothing in the types stops them.
 *
 * Three states were not added. `draft` would make an unissued invoice possible, and
 * a tax invoice has no meaningful draft — the number is allocated at issuance and a
 * number allocated to a draft is a gap in the series. `expired` belongs to
 * documents with a validity window; an invoice has none.
 */
export const invoiceStatus = pgEnum('invoice_status', ['issued', 'cancelled']);

export const invoiceDiscountType = pgEnum('invoice_discount_type', ['percent', 'amount']);

/**
 * Columns every one of the three documents carries, in one place so the invoice,
 * the credit note and the debit note cannot drift apart by transcription.
 *
 * Party and state columns are COPIED FORWARD from the source document at issuance
 * and never re-derived from masters — the rule `performa-invoice.ts:70` states and
 * ADR-016 depends on. An address corrected later must not retroactively change the
 * tax classification of a document already issued.
 */
const documentColumns = {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),

  billToDealerId: uuid()
    .notNull()
    .references(() => dealers.id, { onDelete: 'restrict' }),
  shipToDealerId: uuid()
    .notNull()
    .references(() => dealers.id, { onDelete: 'restrict' }),

  // Tax-engine inputs captured at issuance. 2-letter ISO 3166-2:IN codes.
  tenantStateAtIssue: text().notNull(),
  placeOfSupply: text().notNull(),
  // NULL means the parties matched and the §10 question could not arise (F.5a).
  deliveryArrangement: text(),

  // NO ship_to_address_id. D-7 settles the convention (FK, never a snapshot) and
  // F6 D-5 DEFERS the wiring to F.160, which adds it to the performa invoice, the
  // order, the dispatch note and this table together. An invoice descends from an
  // order that has no such column, so there is nothing to copy forward, and adding
  // it here alone would need a picker no other document has — the
  // "four documents, three conventions" outcome D-7 exists to prevent.

  preparedBy: uuid().references(() => users.id, { onDelete: 'set null' }),

  currency: text().notNull().default('INR'),

  // Totals written by @dealerlink/tax at issuance and READ thereafter — never
  // recomputed at render time (F.152 / F6 D-1). The PDF loader reads these columns
  // and asserts they reconcile with what the lines group to.
  subtotal: decimal({ precision: 14, scale: 2 }).notNull(),
  discountAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
  taxableAmount: decimal({ precision: 14, scale: 2 }).notNull(),
  cgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
  sgstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
  igstAmount: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
  totalAmount: decimal({ precision: 14, scale: 2 }).notNull(),

  status: invoiceStatus().notNull().default('issued'),

  // WHY, alongside the audit columns' who and when. Without a reason, `cancelled`
  // is a state nobody can account for later — and cancellation is the one
  // transition whose justification is not recoverable from the data.
  cancelledAt: timestamp({ withTimezone: true }),
  cancelledBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  cancelledReason: text(),

  termsAndConditions: text(),
  notes: text(),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
};

/** Line columns shared by all three documents' line tables. */
const lineColumns = {
  id: uuid().primaryKey().defaultRandom(),
  tenantId: uuid()
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),

  lineNumber: integer().notNull(),

  productId: uuid()
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  productSku: text().notNull(),
  productName: text().notNull(),
  hsnCode: text().notNull(),

  quantity: decimal({ precision: 12, scale: 3 }).notNull(),
  unitOfMeasure: text().notNull().default('Nos'),
  unitPrice: decimal({ precision: 12, scale: 2 }).notNull(),
  gstRate: decimal({ precision: 5, scale: 2 }).notNull(),
  lineTotal: decimal({ precision: 14, scale: 2 }).notNull(),

  description: text(),
  notes: text(),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

/**
 * Shared CHECK constraints, named per table so a violation names the table.
 *
 * `cancelled` requires BOTH a reason and an actor: a cancellation nobody signed is
 * indistinguishable from one nobody can explain.
 */
function documentChecks(prefix: string, t: Record<string, unknown>) {
  const c = t as Record<string, { name?: string }> & Record<string, unknown>;
  return [
    check(`${prefix}_tenant_state_chk`, sql`${c['tenantStateAtIssue']} ~ '^[A-Z]{2}$'`),
    check(`${prefix}_place_of_supply_chk`, sql`${c['placeOfSupply']} ~ '^[A-Z]{2}$'`),
    check(
      `${prefix}_delivery_arrangement_chk`,
      sql`${c['deliveryArrangement']} IS NULL OR ${c['deliveryArrangement']} IN ('s10_1_a', 's10_1_b')`,
    ),
    check(
      `${prefix}_cancelled_accountable_chk`,
      sql`${c['status']} <> 'cancelled' OR (${c['cancelledReason']} IS NOT NULL AND ${c['cancelledBy']} IS NOT NULL)`,
    ),
  ];
}

export const invoices = pgTable(
  'invoices',
  {
    ...documentColumns,
    invoiceNumber: text().notNull(),

    /** An invoice issues from a CONFIRMED order. `restrict`: deleting an order that has been invoiced must fail loudly. */
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    invoiceDate: date().notNull().defaultNow(),

    discountType: invoiceDiscountType(),
    discountValue: decimal({ precision: 12, scale: 2 }),

    /**
     * The whole-rupee reconciliation term (F6 D-3).
     *
     * **SIGNED. There is deliberately NO `>= 0` CHECK.** Rounding 13,744.40 DOWN to
     * 13,744.00 gives **−0.40**, so a non-negative constraint would reject roughly
     * half of all real documents.
     *
     * The bound is on MAGNITUDE only, and `< 1.00` rather than `<= 0.50`: a tenant
     * that rounds up to the next rupee is doing nothing wrong, and `<= 0.50` would
     * encode an assumption about rounding direction that is not ours to make. What
     * the bound is actually for is rejecting a "round-off" that is really a
     * mis-stated total.
     */
    roundOff: decimal({ precision: 12, scale: 2 }).notNull().default('0'),
  },
  (t) => [
    uniqueIndex('invoices_tenant_number_uq').on(t.tenantId, t.invoiceNumber),
    index('invoices_tenant_status_date_ix').on(t.tenantId, t.status, t.invoiceDate),
    index('invoices_tenant_billto_ix').on(t.tenantId, t.billToDealerId),
    index('invoices_tenant_order_ix').on(t.tenantId, t.orderId),
    ...documentChecks('invoices', t),
    check('invoices_round_off_chk', sql`abs(${t.roundOff}) < 1.00`),
  ],
);

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    ...lineColumns,
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('invoice_lines_invoice_pos_uq').on(t.invoiceId, t.lineNumber),
    index('invoice_lines_tenant_product_ix').on(t.tenantId, t.productId),
    check('invoice_lines_qty_chk', sql`${t.quantity} > 0`),
    check('invoice_lines_unit_price_chk', sql`${t.unitPrice} >= 0`),
    check('invoice_lines_gst_rate_chk', sql`${t.gstRate} >= 0`),
  ],
);

/**
 * The originating-invoice reference carried by both note types.
 *
 * ## THE FK AND THE SNAPSHOT ARE BOTH LOAD-BEARING, FOR DIFFERENT REASONS
 *
 * The FK gives referential integrity and joinability. The **snapshotted number** is
 * there because **a reported value that is a function of another record's CURRENT
 * state is wrong, whether or not any statute requires the snapshot.** If the
 * invoice is renumbered, re-prefixed, or its series changes, a note that derives
 * the originating number through the FK silently restates what it reported. That is
 * the same class of defect F.152 just removed for money: read what was recorded,
 * do not recompute it from whatever the source says today.
 *
 * **Corroboration, not the justification:** GSTR-1's CDNR section reports the
 * original document number, so the snapshot is also what the return needs. That
 * reading is `docs/INVOICE_CN_DN_AUDIT.md`'s own inference from the section name
 * and is **unverified against the BRD** (F.128 — the `.docx` is unreadable to
 * tooling). The decision stands without it.
 */
const originatingInvoice = {
  invoiceId: uuid()
    .notNull()
    .references(() => invoices.id, { onDelete: 'restrict' }),
  /** SNAPSHOT. Not derived from the FK, and never updated. */
  invoiceNumber: text().notNull(),
};

export const creditNotes = pgTable(
  'credit_notes',
  {
    ...documentColumns,
    creditNoteNumber: text().notNull(),
    ...originatingInvoice,
    creditNoteDate: date().notNull().defaultNow(),
    /** Why the credit was issued. Free text in Phase 1; a GSTR-1-grade enumerated reason is a later question. */
    reason: text().notNull(),
  },
  (t) => [
    uniqueIndex('credit_notes_tenant_number_uq').on(t.tenantId, t.creditNoteNumber),
    index('credit_notes_tenant_invoice_ix').on(t.tenantId, t.invoiceId),
    index('credit_notes_tenant_status_date_ix').on(t.tenantId, t.status, t.creditNoteDate),
    ...documentChecks('credit_notes', t),
  ],
);

export const creditNoteLines = pgTable(
  'credit_note_lines',
  {
    ...lineColumns,
    creditNoteId: uuid()
      .notNull()
      .references(() => creditNotes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('credit_note_lines_note_pos_uq').on(t.creditNoteId, t.lineNumber),
    index('credit_note_lines_tenant_product_ix').on(t.tenantId, t.productId),
    // POSITIVE LINES ONLY (F6 D-11). The document type supplies the direction, so a
    // fully-reversed line is OMITTED rather than written with quantity 0 — the
    // engine's bound is `quantity > 0`, measured, and `unitPrice >= 0`, so a
    // zero-PRICE line is legal and a zero-QUANTITY line is not.
    check('credit_note_lines_qty_chk', sql`${t.quantity} > 0`),
    check('credit_note_lines_unit_price_chk', sql`${t.unitPrice} >= 0`),
    check('credit_note_lines_gst_rate_chk', sql`${t.gstRate} >= 0`),
  ],
);

export const debitNotes = pgTable(
  'debit_notes',
  {
    ...documentColumns,
    debitNoteNumber: text().notNull(),
    ...originatingInvoice,
    debitNoteDate: date().notNull().defaultNow(),
    reason: text().notNull(),
  },
  (t) => [
    uniqueIndex('debit_notes_tenant_number_uq').on(t.tenantId, t.debitNoteNumber),
    index('debit_notes_tenant_invoice_ix').on(t.tenantId, t.invoiceId),
    index('debit_notes_tenant_status_date_ix').on(t.tenantId, t.status, t.debitNoteDate),
    ...documentChecks('debit_notes', t),
  ],
);

export const debitNoteLines = pgTable(
  'debit_note_lines',
  {
    ...lineColumns,
    debitNoteId: uuid()
      .notNull()
      .references(() => debitNotes.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('debit_note_lines_note_pos_uq').on(t.debitNoteId, t.lineNumber),
    index('debit_note_lines_tenant_product_ix').on(t.tenantId, t.productId),
    check('debit_note_lines_qty_chk', sql`${t.quantity} > 0`),
    check('debit_note_lines_unit_price_chk', sql`${t.unitPrice} >= 0`),
    check('debit_note_lines_gst_rate_chk', sql`${t.gstRate} >= 0`),
  ],
);
