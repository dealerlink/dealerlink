/**
 * Multi-rate seed (F.81) — the mixed-rate, mixed-HSN documents F.3 and F.4
 * are tested against.
 *
 * Before this module the seeded catalogue was 21 products, two HSN codes and
 * ONE GST rate: `day5.ts` `generateProducts()` emits 20 products at
 * `gstRate: '18'` / `hsnCode: '85414300'`, and `day13.ts` adds a 21st at
 * `'85414011'` / `'18.00'`. Every assertion F.3 or F.4 could write about
 * rate-wise or HSN-wise grouping would therefore have passed whether or not
 * the feature worked, because no seeded document carries two of either.
 *
 * ── WHY THIS RUNS AFTER day13 AND BEFORE pin-created-at ────────────────────
 *
 * Every earlier module picks products POSITIONALLY out of an unordered select:
 * `day7.ts:229` indexes modulo the row count over a select with no ORDER BY,
 * `day8.ts:357` does the same, and `day12.ts` / `day13.ts` each take LIMIT 1
 * with no ORDER BY. Adding a product inside `generateProducts()` would
 * therefore re-deal the lines of documents that already have reference PDFs.
 * Running last means nothing that already exists can pick up these products.
 *
 * Running BEFORE `pin-created-at.ts` is the other half: that pass rewrites
 * `created_at` / `updated_at` on 15 tables including `products`, `quotations`,
 * `performa_invoices`, `orders` and their line tables, so these rows are
 * pinned to the seed clock for free. Anything inserted AFTER it escapes it —
 * the trap `apps/workers/scripts/long-serial-fixture.sql:18-27` fell into and
 * now has to work around by hand.
 *
 * ── WHY THE TOTALS COME FROM `computeTax` ──────────────────────────────────
 *
 * Operator decision, 2026-09-17. This module does NOT reimplement the tax
 * math: it calls the production engine, which is what `apps/web`'s quotation
 * and PI actions call to write exactly these columns.
 *
 * The alternative was `day8.ts`'s local `computeTotals`, and it was rejected on
 * a measurement rather than on taste. `computeTotals` runs `Math.round(n*100)/100`
 * over IEEE-754 doubles; `packages/tax` runs on `decimal.js` because its own
 * docstring says "All money math runs on Decimal — never native floats".
 * Commit e32c350 aligned the seed's rounding MODEL (per-line, not
 * document-level) but not its SUBSTRATE. On a 4-line intra-state document at
 * 18/5/12/5 with a 5% discount the two disagree: CGST 9569.34 against 9569.35.
 * The whole difference is one line — taxable 11827.50 at a 9% CGST half-rate
 * is exactly 1064.475, but the nearest double is 1064.4749999999999091, below
 * the tie, so `Math.round` goes down where `ROUND_HALF_UP` goes up.
 * `quotation-engine-parity.test.ts` asserts exact string equality on all seven
 * header columns, so that document would turn it red.
 *
 * Calling `computeTax` makes the parity test a round-trip for these documents
 * rather than a check between two implementations. That is not a loss worth
 * mourning, and the reason is worth stating so nobody later "restores" the
 * independence: the implementation being given up is one that its own package
 * forbids. An independent check against code known to be wrong is not
 * independence, it is a coin flip that has been landing heads.
 *
 * Converting `computeTotals` to Decimal is filed as F.86 — measured the same
 * day as a zero-diff change on the existing corpus, so it is cheap, and it is
 * NOT a blocker for anything here.
 *
 * ── FIXTURE REALISM, NOT TAX ADVICE ────────────────────────────────────────
 *
 * The product-to-rate mapping below is chosen to exercise grouping code. It
 * asserts NO statutory rate for any HSN. HSN 85414300 appears here at 5% and
 * elsewhere in the catalogue at 18% deliberately (see Chain B); the client's
 * own voucher bills 85414300 at 5% while all 21 previously seeded products
 * carry it at 18%, and this module keeps both rather than reconciling them.
 *
 * Re-runnable: tag-based cleanup at the top, then rebuild.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeTax, serializeOutput, type GstRate, type TaxDiscount } from '@dealerlink/tax';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import {
  dealers,
  orderLines,
  orderStatusHistory,
  orders,
  performaInvoiceLines,
  performaInvoiceStatusHistory,
  performaInvoices,
  products,
  quotationLines,
  quotationStatusHistory,
  quotations,
  tenantSettings,
  tenants,
  users,
} from '../schema';

import { daysAgo, isoDaysAgo, seedNow } from './clock';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const SKU_PREFIX = 'MR-';
const QUOTE_TAG = 'multi-rate-seed-quotation';
const PI_TAG = 'multi-rate-seed-pi';
const ORDER_TAG = 'multi-rate-seed-order';
// F.84's 3% rows carry their own tags: the cleanup below removes them, and the
// corpus test can find them without depending on a document number.
const TP_QUOTE_TAG = 'multi-rate-seed-3pc-quotation';
const TP_PI_TAG = 'multi-rate-seed-3pc-pi';

/**
 * The new catalogue entries, one set per tenant.
 *
 * Rates 5, 12 and 18 were settled by the operator on 2026-09-17 — three groups
 * rather than two, because ordering and pluralisation bugs need a non-trivial
 * middle element to show up.
 *
 * **3% WAS ADDED BY F.84 ON 2026-09-19.** This comment previously said 3% was
 * excluded "because `computeTax` throws on it until F.55 widens the union", and
 * that is no longer true: F.55 replaced every enumerated rate list with a shape
 * rule, so 3% is valid at the DB CHECK, at both Zod layers, in the engine and on
 * the render path. The 3% product and its chain are below, and the sentence is
 * corrected rather than deleted so the sequencing is still legible.
 *
 * 0% remains excluded, and for a different reason that still holds: whether a
 * zero-tax group renders as a row or is suppressed is a decision F.3/F.4 have not
 * taken, and seeding it would freeze one answer blind (filed as F.87).
 */
const NEW_PRODUCTS = [
  {
    sku: `${SKU_PREFIX}MOD-555`,
    name: 'Premier 555W TOPCon Module',
    hsnCode: '85414300',
    gstRate: '5.00',
    sellingPrice: '13325.00',
    manufacturer: 'Premier Energies',
    category: 'Solar Module',
  },
  {
    sku: `${SKU_PREFIX}MOD-585`,
    name: 'Adani 585W Mono PERC Module',
    hsnCode: '85414300',
    gstRate: '5.00',
    sellingPrice: '13125.00',
    manufacturer: 'Adani Solar',
    category: 'Solar Module',
  },
  {
    sku: `${SKU_PREFIX}INV-5K`,
    name: 'Growatt 5kW Hybrid Inverter',
    hsnCode: '85044090',
    gstRate: '12.00',
    sellingPrice: '41500.00',
    manufacturer: 'Growatt',
    category: 'Inverter',
  },
  {
    // F.84. 3% is the rate this fixture exists for. HSN 71131900 is a new code
    // for this catalogue — the four already in use are 85414300, 85414011,
    // 85044090 and 85359090 — so the 3% group is also a new HSN group.
    //
    // FIXTURE REALISM, ASSERTING NO STATUTORY RATE, exactly as the other four
    // entries here. The operator's recorded position (F.55) is that 3% is the
    // gold and precious-metals rate and does not apply to solar equipment at
    // all; the rate is worth supporting because CLAUDE.md §1 makes the product
    // tenant-agnostic, not because this catalogue would ever bill it. The
    // product is named so a reader is not misled into thinking otherwise.
    sku: `${SKU_PREFIX}ASSAY-KIT`,
    name: 'Assay Reference Kit (fixture-only, non-solar)',
    hsnCode: '71131900',
    gstRate: '3.00',
    sellingPrice: '4165.00',
    manufacturer: 'Fixture Co',
    category: 'Fixture',
  },
  {
    // Heading 8535 is switching and protective apparatus; the client's own
    // voucher bills a "PEDLER LB SWITCH-40A", so an isolator is what a reader
    // expects to find under this code — not a panel.
    sku: `${SKU_PREFIX}ISO-40A`,
    name: 'Havells 40A DC Isolator Switch',
    hsnCode: '85359090',
    gstRate: '18.00',
    sellingPrice: '4150.00',
    manufacturer: 'Havells',
    category: 'Protection',
  },
  // ── F.101's Chain E products ────────────────────────────────────────────
  //
  // FIXTURE-ONLY, with their own SKUs, and deliberately NOT line-level price
  // overrides on the products above. An override routes through F.91's
  // re-stamp-on-draft-save path and would add a second variable to a fixture
  // whose whole purpose is to isolate one (F.101 A.4). The prices are chosen so
  // the four line subtotals come to 24997 / 119925 / 83000 / 12450 — the document
  // F.101's row measured, and the only shape known to carry a non-zero
  // discount-allocation residual under the OLD engine.
  //
  // APPENDED, never inserted above, for the reason the chain ordering gives.
  {
    sku: `${SKU_PREFIX}F101-3`,
    name: 'F.101 fixture — 3% line',
    hsnCode: '71131900',
    gstRate: '3.00',
    sellingPrice: '3571.00',
    manufacturer: 'Dealerlink Fixtures',
    category: 'Fixture',
  },
  {
    sku: `${SKU_PREFIX}F101-5`,
    name: 'F.101 fixture — 5% line',
    hsnCode: '85414300',
    gstRate: '5.00',
    sellingPrice: '13325.00',
    manufacturer: 'Dealerlink Fixtures',
    category: 'Fixture',
  },
  {
    sku: `${SKU_PREFIX}F101-12`,
    name: 'F.101 fixture — 12% line',
    hsnCode: '85044090',
    gstRate: '12.00',
    sellingPrice: '8300.00',
    manufacturer: 'Dealerlink Fixtures',
    category: 'Fixture',
  },
  {
    sku: `${SKU_PREFIX}F101-18`,
    name: 'F.101 fixture — 18% line',
    hsnCode: '85359090',
    gstRate: '18.00',
    sellingPrice: '4150.00',
    manufacturer: 'Dealerlink Fixtures',
    category: 'Fixture',
  },
] as const;

interface LineSpec {
  sku: string;
  name: string;
  hsnCode: string;
  productId: string;
  gstRate: GstRate;
  quantity: number;
  unitPrice: number;
}

/** Atomically allocate the next per-tenant per-FY document counter value. */
async function nextCounter(
  tx: { execute: (q: ReturnType<typeof sql>) => Promise<unknown> },
  tenantId: string,
  docType: string,
  fy: number,
): Promise<number> {
  const res = await tx.execute(sql`
    INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
    VALUES (${tenantId}, ${docType}, ${fy}, 1)
    ON CONFLICT (tenant_id, doc_type, fiscal_year)
    DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
    RETURNING last_value
  `);
  return Number((res as { last_value: string | number }[])[0]!.last_value);
}

function totalsFor(
  lines: LineSpec[],
  tenantState: string,
  placeOfSupply: string,
  discount: TaxDiscount = null,
) {
  return serializeOutput(
    computeTax({
      tenantState,
      placeOfSupply,
      lines: lines.map((l, i) => ({
        lineId: `L${i + 1}`,
        quantity: l.quantity.toFixed(3),
        unitPrice: l.unitPrice.toFixed(2),
        gstRate: l.gstRate,
      })),
      // Chains A-D pass no document discount, and the default keeps that. The
      // original reason was that a discount is the one input that makes a float
      // seed and the Decimal engine disagree (see the header), so leaving it off
      // kept this module's documents comparable with day8's. F.86 removes that
      // constraint; it was never a limitation of the engine.
      //
      // F.101's Chain E passes one DELIBERATELY, and it is the only chain that
      // does. Its whole purpose is to exercise the discount allocation, which no
      // other seeded document in the corpus can: all 24 discounted seeded
      // documents have a zero residual, measured across all three document types.
      discount,
    }),
  );
}

function fiscalYearOf(d: Date): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

async function seedTenant(
  db: ReturnType<typeof drizzle>,
  tenantId: string,
  tenantSlug: string,
  actorId: string,
  fy: number,
): Promise<{ products: number; quotations: number; pis: number; orders: number }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${actorId}, true)`);
    await tx.execute(sql`SELECT set_config('app.read_only', '', true)`);

    const [settings] = await tx
      .select({ state: tenantSettings.state })
      .from(tenantSettings)
      .where(sql`tenant_id = ${tenantId}`)
      .limit(1);
    const tenantState = settings?.state ?? 'MH';

    // Deterministic dealer picks. ORDER BY display_name, which is unique
    // within a tenant+state — NOT LIMIT 1 over an unordered select, which is
    // the pattern A.1 of the day prompt calls out in the earlier modules.
    const [intraDealer] = await tx
      .select({ id: dealers.id, name: dealers.displayName, state: dealers.state })
      .from(dealers)
      .where(
        sql`tenant_id = ${tenantId} AND deleted_at IS NULL AND status = 'active'
            AND state = ${tenantState}`,
      )
      .orderBy(dealers.displayName)
      .limit(1);
    const [interDealer] = await tx
      .select({ id: dealers.id, name: dealers.displayName, state: dealers.state })
      .from(dealers)
      .where(
        sql`tenant_id = ${tenantId} AND deleted_at IS NULL AND status = 'active'
            AND state <> ${tenantState}`,
      )
      .orderBy(dealers.displayName)
      .limit(1);
    if (!intraDealer || !interDealer) {
      console.log('  · (need one intra-state and one inter-state dealer — skipping)');
      return { products: 0, quotations: 0, pis: 0, orders: 0 };
    }

    // An EXISTING 18% product on HSN 85414300, for Chain B. Picked by SKU so
    // the choice does not move between reseeds.
    const [legacyPanel] = await tx
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        hsnCode: products.hsnCode,
      })
      .from(products)
      .where(
        sql`tenant_id = ${tenantId} AND hsn_code = '85414300' AND gst_rate = 18.00
            AND sku NOT LIKE ${`${SKU_PREFIX}%`}`,
      )
      .orderBy(products.sku)
      .limit(1);
    if (!legacyPanel) {
      console.log('  · (no existing 18% / 85414300 product — skipping)');
      return { products: 0, quotations: 0, pis: 0, orders: 0 };
    }

    // ── The products ──────────────────────────────────────────────────────
    const inserted = new Map<string, string>();
    for (const p of NEW_PRODUCTS) {
      const [row] = await tx
        .insert(products)
        .values({
          tenantId,
          sku: p.sku,
          name: p.name,
          hsnCode: p.hsnCode,
          gstRate: p.gstRate,
          defaultSellingPrice: p.sellingPrice,
          manufacturer: p.manufacturer,
          category: p.category,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: products.id });
      inserted.set(p.sku, row!.id);
    }
    const pid = (sku: string): string => inserted.get(sku)!;
    const meta = (sku: string) => NEW_PRODUCTS.find((p) => p.sku === sku)!;
    const spec = (sku: string, quantity: number, unitPrice: number): LineSpec => {
      const m = meta(sku);
      return {
        sku: m.sku,
        name: m.name,
        hsnCode: m.hsnCode,
        productId: pid(sku),
        gstRate: Number(m.gstRate) as GstRate,
        quantity,
        unitPrice,
      };
    };

    // ── Chain A — intra-state, 1:1 HSN↔rate, THREE rate groups ────────────
    //
    // Line order is 18 → 5 → 12 → 5. Two things depend on that and both are
    // deliberate:
    //
    //  (1) IT IS NOT ASCENDING BY RATE. F3_F4_SPEC §3 requires rate groups to
    //      be ordered ascending in the output. If line 1 were the lowest rate
    //      the sort would be satisfied by doing nothing at all, and a missing
    //      sort would pass.
    //
    //  (2) THERE ARE TWO 5% LINES, and that is the whole point of the shape.
    //      5% is one of only two rates in the allowed set that is
    //      rounding-sensitive under the intra-state CGST/SGST split: CGST at
    //      half of 5% is 2.5%, which lands off 2dp on half of all integer line
    //      subtotals, while 0/12/18/28 have whole-percentage halves and are
    //      exact on every integer. With a SINGLE 5% line, per-line rounding and
    //      document-level rounding agree trivially — so a regression of
    //      e32c350 would pass unnoticed. With two, they do not: this document
    //      gives CGST 10073.01 per-line against 10073.00 document-level.
    //      Do not "simplify" these to one line.
    //
    // Within this document each HSN carries exactly one rate (85359090→18,
    // 85414300→5, 85044090→12), which is the 1:1 shape F3_F4_SPEC §2's
    // reference table uses, so F.4's HSN output can be checked against a
    // written target.
    const chainALines: LineSpec[] = [
      spec(`${SKU_PREFIX}ISO-40A`, 3, 4150),
      spec(`${SKU_PREFIX}MOD-555`, 7, 13325),
      spec(`${SKU_PREFIX}INV-5K`, 2, 41500),
      spec(`${SKU_PREFIX}MOD-585`, 5, 13125),
    ];

    // ── Chain B — inter-state (IGST), HSN 85414300 carrying TWO rates ──────
    //
    // Line 1 is an EXISTING catalogue panel: HSN 85414300 at 18%. Line 2 is
    // the new module: the SAME HSN at 5%. So this document's HSN grouping and
    // its rate grouping are not the same partition — 2 HSN groups, 2 rate
    // groups, but different memberships. An HSN table implemented by grouping
    // on rate emits three rows here instead of two, which is a mistake Chain A
    // structurally cannot detect.
    //
    // Inter-state also gives F.3's IGST path a mixed-rate document. IGST is
    // levied at the full rate, so 5% IGST is exact on integers and this
    // document carries no rounding sensitivity — that job is Chain A's.
    const chainBLines: LineSpec[] = [
      {
        sku: legacyPanel.sku,
        name: legacyPanel.name,
        hsnCode: legacyPanel.hsnCode,
        productId: legacyPanel.id,
        gstRate: 18,
        quantity: 4,
        unitPrice: 11125,
      },
      spec(`${SKU_PREFIX}MOD-555`, 9, 13325),
      spec(`${SKU_PREFIX}ISO-40A`, 6, 4150),
    ];

    // ── Chain C — F.84: SINGLE-RATE 3%, intra-state ──────────────────────────
    //
    // BOTH PROPERTIES ARE REQUIRED BY THE ACCEPTANCE CRITERION, not stylistic.
    // The half-rate label the render check asserts on (`1.5%`) exists only when
    // the document carries ONE rate — `quotation.tsx` sets `gstRateLabel` to null
    // otherwise and `view-model.ts` then renders an empty string — and only the
    // intra-state branch of `quotation.typ` emits a half at all; inter-state
    // prints the full rate as IGST. A mixed or inter-state 3% document would
    // make that criterion unsatisfiable (F.84 day prompt R-1).
    //
    // TWO LINES, BOTH WITH ODD INTEGER-RUPEE SUBTOTALS. 3% halves to 1.5%, and
    // 1.5% of an odd integer lands on a half-paisa, so per-line and
    // document-level rounding diverge and a regression of the per-line model is
    // visible rather than silent. Measured before these prices were chosen:
    // 3 x 4165 = 12495 and 7 x 3571 = 24997 give CGST 562.39 per-line against
    // 562.38 document-level, while an even-subtotal control (2 x 4166,
    // 4 x 3570) gives 339.18 either way — so the divergence comes from the odd
    // choice and not from coincidence. Same argument as Chain A's two 5% lines.
    // F.101's fixture document. Prices are each product's own catalogue price —
    // no line-level override, so the fixture isolates the discount allocation and
    // nothing else.
    const chainELines: LineSpec[] = [
      spec(`${SKU_PREFIX}F101-3`, 7, 3571),
      spec(`${SKU_PREFIX}F101-5`, 9, 13325),
      spec(`${SKU_PREFIX}F101-12`, 10, 8300),
      spec(`${SKU_PREFIX}F101-18`, 3, 4150),
    ];

    const chainCLines: LineSpec[] = [
      spec(`${SKU_PREFIX}ASSAY-KIT`, 3, 4165),
      spec(`${SKU_PREFIX}ASSAY-KIT`, 7, 3571),
    ];

    let quotationCount = 0;
    let piCount = 0;
    let orderCount = 0;

    /**
     * Build quotation → PI, and optionally → order, for one chain.
     *
     * Place of supply is the SHIP-TO state per ADR-012. Both chains use a
     * single dealer as bill-to and ship-to, so it reduces to that dealer's
     * state; this module introduces no new dealer and changes no tax rule.
     */
    async function buildChain(
      label: string,
      lines: LineSpec[],
      dealer: { id: string; state: string | null },
      opts: {
        withOrder: boolean;
        daysAgoIssued: number;
        /**
         * F.84 / D-7. When false the chain stops at the quotation, leaving it
         * `accepted` and UNCONVERTED so the e2e has an explicit precondition to
         * convert. The alternative — letting the spec re-convert an
         * already-converted quotation — would make it depend on the absence of a
         * guard in `convert-quotation-to-pi.ts` that nobody has decided should
         * be absent.
         */
        withPi?: boolean;
        /**
         * F.101 Chain E only. Chains A-D pass none, which is why this is
         * optional: the corpus deliberately had no document whose discount
         * allocation could leave a residual, and Chain E is the one that does.
         */
        discount?: TaxDiscount;
        /** Overrides for the F.84 rows so cleanup can find them by tag. */
        quoteTag?: string;
        piTag?: string;
      },
    ) {
      const placeOfSupply = dealer.state ?? tenantState;
      const totals = totalsFor(lines, tenantState, placeOfSupply, opts.discount ?? null);

      const quoteDate = daysAgo(opts.daysAgoIssued);
      const quoteSeq = await nextCounter(tx, tenantId, 'quotation', fy);
      const quoteNumber = `QT-${fy}-${String(quoteSeq).padStart(4, '0')}`;
      const [quote] = await tx
        .insert(quotations)
        .values({
          tenantId,
          quoteNumber,
          revision: 1,
          // No deal link: day8's deals are dealt positionally and this
          // module must not reach back into them.
          dealId: null,
          dealerId: dealer.id,
          preparedBy: actorId,
          tenantStateAtIssue: tenantState,
          placeOfSupply,
          quoteDate: quoteDate.toISOString().slice(0, 10),
          validUntil: isoDaysAgo(opts.daysAgoIssued - 30),
          currency: 'INR',
          subtotal: totals.subtotal,
          discountType: opts.discount?.type ?? null,
          discountValue: opts.discount ? String(opts.discount.value) : null,
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          totalAmount: totals.totalAmount,
          termsAndConditions:
            'Payment due within agreed credit terms. Goods once sold cannot be returned.',
          status: 'accepted',
          sentAt: new Date(quoteDate.getTime() + 60_000),
          sentVia: 'email',
          acceptedAt: new Date(quoteDate.getTime() + 2 * 86_400_000),
          notes: opts.quoteTag ?? QUOTE_TAG,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: quotations.id });
      quotationCount++;

      await tx.insert(quotationLines).values(
        lines.map((l, i) => ({
          tenantId,
          quotationId: quote!.id,
          lineNumber: i + 1,
          productId: l.productId,
          productSku: l.sku,
          productName: l.name,
          hsnCode: l.hsnCode,
          quantity: l.quantity.toFixed(3),
          unitOfMeasure: 'Nos',
          unitPrice: l.unitPrice.toFixed(2),
          gstRate: l.gstRate.toFixed(2),
          lineTotal: totals.lines[i]!.lineSubtotal,
        })),
      );
      await tx.insert(quotationStatusHistory).values([
        {
          tenantId,
          quotationId: quote!.id,
          fromStatus: null,
          toStatus: 'draft' as const,
          transitionedBy: actorId,
          transitionedAt: quoteDate,
          reason: 'quotation_created',
        },
        {
          tenantId,
          quotationId: quote!.id,
          fromStatus: 'draft' as const,
          toStatus: 'sent' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(quoteDate.getTime() + 60_000),
          reason: 'sent_via_email',
        },
        {
          tenantId,
          quotationId: quote!.id,
          fromStatus: 'sent' as const,
          toStatus: 'accepted' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(quoteDate.getTime() + 2 * 86_400_000),
          reason: null,
        },
      ]);

      if (opts.withPi === false) {
        console.log(`  · ${label}: ${quoteNumber} (accepted, deliberately unconverted)`);
        return;
      }

      const piDate = daysAgo(opts.daysAgoIssued - 3);
      const piSeq = await nextCounter(tx, tenantId, 'performa_invoice', fy);
      const [pi] = await tx
        .insert(performaInvoices)
        .values({
          tenantId,
          piNumber: `PI-${fy}-${String(piSeq).padStart(4, '0')}`,
          quotationId: quote!.id,
          dealId: null,
          billToDealerId: dealer.id,
          shipToDealerId: dealer.id,
          tenantStateAtIssue: tenantState,
          placeOfSupply,
          preparedBy: actorId,
          piDate: piDate.toISOString().slice(0, 10),
          validUntil: isoDaysAgo(opts.daysAgoIssued - 33),
          currency: 'INR',
          subtotal: totals.subtotal,
          discountType: opts.discount?.type ?? null,
          discountValue: opts.discount ? String(opts.discount.value) : null,
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          totalAmount: totals.totalAmount,
          status: 'confirmed',
          sentAt: new Date(piDate.getTime() + 60_000),
          confirmedAt: new Date(piDate.getTime() + 86_400_000),
          notes: opts.piTag ?? PI_TAG,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: performaInvoices.id });
      piCount++;

      await tx.insert(performaInvoiceLines).values(
        lines.map((l, i) => ({
          tenantId,
          performaInvoiceId: pi!.id,
          lineNumber: i + 1,
          productId: l.productId,
          productSku: l.sku,
          productName: l.name,
          hsnCode: l.hsnCode,
          quantity: l.quantity.toFixed(3),
          unitOfMeasure: 'Nos',
          unitPrice: l.unitPrice.toFixed(2),
          gstRate: l.gstRate.toFixed(2),
          lineTotal: totals.lines[i]!.lineSubtotal,
        })),
      );
      await tx.insert(performaInvoiceStatusHistory).values([
        {
          tenantId,
          performaInvoiceId: pi!.id,
          fromStatus: null,
          toStatus: 'draft' as const,
          transitionedBy: actorId,
          transitionedAt: piDate,
          reason: 'pi_created',
        },
        {
          tenantId,
          performaInvoiceId: pi!.id,
          fromStatus: 'draft' as const,
          toStatus: 'confirmed' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(piDate.getTime() + 86_400_000),
          reason: 'confirmed_by_dealer',
        },
      ]);

      if (!opts.withOrder) {
        console.log(`  · ${label}: ${quoteNumber} → PI (${lines.length} lines)`);
        return;
      }

      const orderDate = daysAgo(opts.daysAgoIssued - 5);
      const orderSeq = await nextCounter(tx, tenantId, 'order', fy);
      const orderNumber = `ORD-${fy}-${String(orderSeq).padStart(4, '0')}`;
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId,
          orderNumber,
          performaInvoiceId: pi!.id,
          quotationId: quote!.id,
          dealId: null,
          billToDealerId: dealer.id,
          shipToDealerId: dealer.id,
          tenantStateAtIssue: tenantState,
          placeOfSupply,
          orderDate: orderDate.toISOString().slice(0, 10),
          currency: 'INR',
          subtotal: totals.subtotal,
          // orders carry only the RESOLVED discount_amount — there is no
          // discount_type or discount_value column on that table.
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          totalAmount: totals.totalAmount,
          // `confirmed` because gstSummaryReport counts only the four supply
          // statuses (apps/web/lib/reports/gst-summary.ts:23-28) — a `pending`
          // order is invisible to the report this document exists to exercise.
          status: 'confirmed',
          confirmedAt: new Date(orderDate.getTime() + 3_600_000),
          paymentStatus: 'unpaid',
          notes: ORDER_TAG,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: orders.id });
      orderCount++;

      await tx.insert(orderLines).values(
        lines.map((l, i) => ({
          tenantId,
          orderId: order!.id,
          lineNumber: i + 1,
          productId: l.productId,
          productSku: l.sku,
          productName: l.name,
          hsnCode: l.hsnCode,
          quantity: l.quantity.toFixed(3),
          unitOfMeasure: 'Nos',
          unitPrice: l.unitPrice.toFixed(2),
          gstRate: l.gstRate.toFixed(2),
          lineTotal: totals.lines[i]!.lineSubtotal,
          // No inventory is created for the multi-rate catalogue and none is
          // reserved: this order exists for tax grouping, not fulfilment.
          // day11 already produces confirmed orders with zero reserved lines
          // whenever its serial pool runs dry (day11.ts:443-457), so this is
          // the existing shape rather than a new one.
          reservedQuantity: '0',
          dispatchedQuantity: '0',
        })),
      );
      await tx.insert(orderStatusHistory).values([
        {
          tenantId,
          orderId: order!.id,
          fromStatus: null,
          toStatus: 'pending' as const,
          transitionedBy: actorId,
          transitionedAt: orderDate,
          reason: 'order_created',
        },
        {
          tenantId,
          orderId: order!.id,
          fromStatus: 'pending' as const,
          toStatus: 'confirmed' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(orderDate.getTime() + 3_600_000),
          reason: 'multi-rate seed',
        },
      ]);
      console.log(`  · ${label}: ${quoteNumber} → PI → ${orderNumber} (${lines.length} lines)`);
    }

    await buildChain('Chain A (intra, 18/5/12/5)', chainALines, intraDealer, {
      withOrder: false,
      daysAgoIssued: 40,
    });
    await buildChain('Chain B (inter, 18/5/18)', chainBLines, interDealer, {
      withOrder: true,
      daysAgoIssued: 34,
    });

    // ── F.84's chains go HERE, STRICTLY AFTER CHAIN B. THE ORDER IS LOAD-BEARING.
    //
    // Document numbers come from `nextCounter`, so a chain allocated before an
    // existing one renumbers it. Several existing numbers are pinned by name
    // elsewhere and would break silently: `apps/workers/scripts/typst-matrix.json`
    // names QT-2026-0001, QT-2026-0006, QT-2026-0010, PI-2026-0001, PI-2026-0002,
    // PAY-2026-0007 and DSP-2026-0005, and
    // `apps/workers/scripts/long-serial-fixture.sql` resolves ORD-2026-0019 by
    // name and raises if it is missing.
    //
    // THIS ORDERING IS ALSO WHAT MAKES IT SAFE FOR A TEST TO ADDRESS A DOCUMENT
    // BY NUMBER AT ALL. F.84's render check uses `resolveDocument` with a
    // document number, the same way the 14 reference cases do, and that is only
    // sound because appending here leaves every prior allocation fixed. If a
    // future chain is inserted above this point, those numbers move and both the
    // matrix and that test re-point silently. Append below, never above.
    await buildChain('Chain C (intra, single-rate 3%)', chainCLines, intraDealer, {
      withOrder: false,
      daysAgoIssued: 28,
      quoteTag: TP_QUOTE_TAG,
      piTag: TP_PI_TAG,
    });
    // D-7: accepted and deliberately NOT converted, so the e2e has an explicit
    // precondition rather than relying on a missing guard.
    await buildChain('Chain D (intra, 3%, unconverted)', chainCLines, intraDealer, {
      withOrder: false,
      withPi: false,
      daysAgoIssued: 22,
      quoteTag: TP_QUOTE_TAG,
    });

    // ── F.101's Chain E. APPENDED AFTER CHAIN D, and seeded AFTER the fix ────
    //
    // THE SEQUENCING IS THE POINT, not a detail. If this chain were seeded while
    // the old proportional allocation was still in place, its stored headers
    // would be written by the old engine, and the moment the allocation changed,
    // its four movable columns — cgst_amount, sgst_amount, igst_amount,
    // total_amount — would recompute differently from what is stored. The
    // fixture built to prove the fix would become an F.99 historical document
    // inside our own corpus, and the parity test would go red for a reason with
    // nothing to do with the allocation being wrong.
    //
    // WHAT IT EXERCISES THAT NOTHING ELSE DOES. Every one of the 24 discounted
    // seeded documents has a zero allocation residual — measured across
    // quotations, PIs and orders during F.101's A.0 — so the corpus could
    // demonstrate neither the defect nor the fix. This is the shape that can:
    // four rates, line subtotals 24997 / 119925 / 83000 / 12450, and a 12.5%
    // document discount. Under the OLD engine sum(lineDiscount) came to 30046.51
    // against a document discount of 30046.50, leaving sum(lineTaxable) a paisa
    // under taxable_amount. Under largest-remainder both reconcile exactly.
    //
    // It also EXERCISES THE TIE-BREAK: two of its lines finish with equal
    // remainders, so the allocation has to fall through to D-1's second key.
    await buildChain('Chain E (inter, 4-rate, 12.5% discount — F.101)', chainELines, interDealer, {
      withOrder: true,
      daysAgoIssued: 16,
      discount: { type: 'percent', value: 12.5 },
    });

    void tenantSlug;
    return {
      products: NEW_PRODUCTS.length,
      quotations: quotationCount,
      pis: piCount,
      orders: orderCount,
    };
  });
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Multi-rate seed: mixed-rate / mixed-HSN documents (F.81)');

  // Re-runnable cleanup, FK-safe order: orders reference PIs and quotations,
  // every line table references products with ON DELETE RESTRICT.
  await client.unsafe(`DELETE FROM orders WHERE notes = '${ORDER_TAG}';`);
  await client.unsafe(`DELETE FROM performa_invoices WHERE notes = '${PI_TAG}';`);
  await client.unsafe(`DELETE FROM performa_invoices WHERE notes = '${TP_PI_TAG}';`);
  await client.unsafe(`DELETE FROM quotations WHERE notes = '${QUOTE_TAG}';`);
  await client.unsafe(`DELETE FROM quotations WHERE notes = '${TP_QUOTE_TAG}';`);
  await client.unsafe(`DELETE FROM products WHERE sku LIKE '${SKU_PREFIX}%';`);

  const fy = fiscalYearOf(seedNow());
  const tenantRows = await db.select().from(tenants);
  for (const t of tenantRows) {
    if (t.status !== 'active') continue;
    console.log(`  · Tenant ${t.slug}`);
    const [sales] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'sales'`)
      .limit(1);
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'admin'`)
      .limit(1);
    const actorId = sales?.id ?? admin?.id;
    if (!actorId) {
      console.log('  · (no sales/admin user — skipping)');
      continue;
    }
    const r = await seedTenant(db, t.id, t.slug, actorId, fy);
    console.log(
      `  · ${r.products} products, ${r.quotations} quotations, ${r.pis} PIs, ${r.orders} orders`,
    );
  }

  await client.end({ timeout: 5 });
  console.log('✓ Multi-rate seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Multi-rate seed failed:', err);
  process.exit(1);
});
