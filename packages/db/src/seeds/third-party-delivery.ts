/**
 * F.5a D-11 — a §10(1)(b) chain, end to end, in its OWN tenant.
 *
 * ## WHY A SEEDED CHAIN AT ALL, WHEN THERE ARE UNIT FIXTURES
 *
 * `packages/tax/tests/place-of-supply.test.ts` proves the pure function branches
 * correctly. It cannot prove that the COLUMN, the two write sites, the
 * copy-forward at `status-transitions.ts` and the read paths all agree — which is
 * the half of a change F.103 demonstrated nobody catches by reading. Before this
 * module, the entire seeded corpus was arrangement (a), so every (b) code path
 * was exercised by unit tests only and by nothing that had been through Postgres.
 *
 * ## ITS OWN TENANT, ON F.106'S ARGUMENT
 *
 * `document_counters` is keyed `(tenant_id, doc_type, fiscal_year)`, so a new
 * tenant's counters start at 1 and CANNOT shift a pinned document number in
 * `demo`, `sample` or `maharudra`. That is what makes adding a chain safe at all:
 * the 14 Chromium reference PDFs are addressed by tenant slug plus document
 * number, and this tenant is in neither half of any of those addresses.
 *
 * Runs after every other module and before `pin-created-at.ts`, so its rows get
 * pinned timestamps like everything else.
 *
 * ## THE FIXTURE IS CHOSEN SO THE TWO ARRANGEMENTS DISAGREE ABOUT THE TAX TYPE
 *
 * Tenant in `MH`. Bill-To in `MH`. Ship-To in `KA`.
 *
 * - Under **§10(1)(a)** the place of supply would be `KA` — different from the
 *   tenant's `MH` — so the document would be **inter-state, IGST**.
 * - Under **§10(1)(b)**, which is what this chain records, the place of supply is
 *   the Bill-To state `MH` — equal to the tenant state — so it is **intra-state,
 *   CGST + SGST**.
 *
 * A fixture whose two arrangements produced different STATES but the same tax type
 * would be a weak test of a rule that exists to decide the tax type. This one
 * flips it, so a regression in the branch shows up as the wrong tax on a stored
 * document rather than as a cosmetic difference.
 *
 * ## IT IS NOT A MATRIX ENTRY, DELIBERATELY (D-11)
 *
 * A 15th entry in `scripts/typst-matrix.json` would need a Chromium reference PDF,
 * and that pipeline is gone (F.83) — a one-way door this day does not open. So
 * nothing here proves the tax-type LABEL renders correctly on a page under (b);
 * only that the classification is right. That gap is F.131, and it is stated
 * rather than left implicit.
 */
import { computeTax, serializeOutput } from '@dealerlink/tax';
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import {
  dealers,
  orderLines,
  orders,
  performaInvoiceLines,
  performaInvoices,
  products,
  quotationLines,
  quotations,
  tenants,
  tenantSettings,
  users,
} from '../schema';

import { SEED_EPOCH_ISO } from './clock';

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const DEV_PASSWORD = 'password123';

const TENANT = {
  slug: 'thirdparty',
  legalName: 'Sahyadri Power Distributors Private Limited',
  displayName: 'Sahyadri Power',
  /** MH, so that the §10(1)(b) answer collides with it and flips the tax type. */
  state: 'MH',
  gstin: '27AABCS1429B1ZX',
  pan: 'AABCS1429B',
  inboundEmailToken: 'tp7k2m9x4q',
};

/** Bill-To shares the tenant's state; Ship-To does not. That is the whole point. */
const BILL_TO = {
  dealerCode: 'TP-D001',
  legalName: 'Konkan Renewables LLP',
  displayName: 'Konkan Renewables',
  state: 'MH',
  city: 'Nashik',
  gstin: '27AACFK8812M1Z5',
};
const SHIP_TO = {
  dealerCode: 'TP-D002',
  legalName: 'Hubli Agro Farms Private Limited',
  displayName: 'Hubli Agro Farms',
  state: 'KA',
  city: 'Hubli',
  gstin: '29AABCH5567L1ZQ',
};

const PRODUCT = {
  sku: 'TP-MOD-550',
  name: 'Sahyadri 550Wp Mono PERC Module',
  hsnCode: '85414300',
  /** For the DB column, which is `decimal(5,2)` and takes a string. */
  gstRateStored: '18.00',
  /** For the engine, whose `GstRate` is `number` and whose guard rejects a string. */
  gstRate: 18,
  unitPrice: 12_650,
};

type LineSpec = { gstRate: number; quantity: number; unitPrice: number };
const LINES: LineSpec[] = [
  { gstRate: PRODUCT.gstRate, quantity: 60, unitPrice: PRODUCT.unitPrice },
];

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

/** No discount anywhere here — the parameter is not offered, so adding one is a
 * deliberate edit rather than an oversight. Same choice as `client-demo.ts`. */
function totalsFor(placeOfSupply: string) {
  return serializeOutput(
    computeTax({
      tenantState: TENANT.state,
      placeOfSupply,
      discount: null,
      lines: LINES.map((l, i) => ({
        lineId: `L${i + 1}`,
        quantity: l.quantity.toFixed(3),
        unitPrice: l.unitPrice.toFixed(2),
        gstRate: l.gstRate,
      })),
    }),
  );
}

function fiscalYearOf(d: Date): number {
  const m = d.getUTCMonth();
  return m >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

async function main(): Promise<void> {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Seeding the §10(1)(b) third-party delivery chain (F.5a D-11)');

  const existing = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(sql`slug = ${TENANT.slug}`)
    .limit(1);
  if (existing.length > 0) {
    console.log(`  · tenant "${TENANT.slug}" already present — skipping`);
    await client.end({ timeout: 5 });
    return;
  }

  const passwordHash = await hash(DEV_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    algorithm: 2,
  });

  const [tenantRow] = await db
    .insert(tenants)
    .values({
      slug: TENANT.slug,
      legalName: TENANT.legalName,
      displayName: TENANT.displayName,
      status: 'active',
    })
    .returning({ id: tenants.id });
  const tenantId = tenantRow!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.insert(tenantSettings).values({
      tenantId,
      gstin: TENANT.gstin,
      pan: TENANT.pan,
      addressLine1: 'Plot 22, Satpur Industrial Area',
      addressCity: 'Nashik',
      addressPincode: '422007',
      addressCountry: 'IN',
      state: TENANT.state,
      inboundEmailToken: TENANT.inboundEmailToken,
    });
    for (const role of ['admin', 'sales'] as const) {
      await tx.insert(users).values({
        tenantId,
        email: `${role}@${TENANT.slug}.test`,
        passwordHash,
        role,
        fullName: role === 'admin' ? 'Anil Deshpande' : 'Rupa Kulkarni',
        status: 'active',
        mustChangePassword: false,
      });
    }
  });

  const [actor] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`tenant_id = ${tenantId} AND role = 'sales'`)
    .limit(1);
  const actorId = actor!.id;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`SELECT set_config('app.user_id', ${actorId}, true)`);

    // THE TENANT STATE IS READ BACK, NOT REUSED FROM THE CONSTANT. F.103 removed
    // exactly this class of defect, and `client-demo.ts` carries the same comment
    // for the same reason: a hardcoded state is wrong for every tenant that is not
    // in it, and the whole subject of this module is which state gets used.
    const [settings] = await tx
      .select({ state: tenantSettings.state })
      .from(tenantSettings)
      .where(sql`tenant_id = ${tenantId}`)
      .limit(1);
    const tenantState = settings!.state!.toUpperCase();

    const dealerIds: Record<string, string> = {};
    for (const d of [BILL_TO, SHIP_TO]) {
      const [row] = await tx
        .insert(dealers)
        .values({
          tenantId,
          dealerCode: d.dealerCode,
          legalName: d.legalName,
          displayName: d.displayName,
          addressLine1: `${d.city} Road`,
          city: d.city,
          state: d.state,
          pincode: d.state === 'MH' ? '422001' : '580020',
          country: 'IN',
          gstin: d.gstin,
          status: 'active',
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: dealers.id });
      dealerIds[d.dealerCode] = row!.id;
    }
    const billToId = dealerIds[BILL_TO.dealerCode]!;
    const shipToId = dealerIds[SHIP_TO.dealerCode]!;

    const [productRow] = await tx
      .insert(products)
      .values({
        tenantId,
        sku: PRODUCT.sku,
        name: PRODUCT.name,
        hsnCode: PRODUCT.hsnCode,
        gstRate: PRODUCT.gstRateStored,
        unitOfMeasure: 'Nos',
        defaultSellingPrice: PRODUCT.unitPrice.toFixed(2),
        status: 'active',
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ id: products.id });
    const productId = productRow!.id;

    const issuedAt = new Date(SEED_EPOCH_ISO);
    const fy = fiscalYearOf(issuedAt);
    const docDate = issuedAt.toISOString().slice(0, 10);

    // ── The quotation. One dealer, so §10 cannot be expressed: place of supply is
    //    the dealer's own state, exactly as CLAUDE.md §5 and ADR-016 both say.
    const quoteNumber = `QT-${fy}-${String(await nextCounter(tx, tenantId, 'quotation', fy)).padStart(4, '0')}`;
    const quotePos = BILL_TO.state;
    const qt = totalsFor(quotePos);
    const [quotationRow] = await tx
      .insert(quotations)
      .values({
        tenantId,
        quoteNumber,
        dealerId: billToId,
        tenantStateAtIssue: tenantState,
        placeOfSupply: quotePos,
        preparedBy: actorId,
        quoteDate: docDate,
        validUntil: docDate,
        currency: 'INR',
        subtotal: qt.subtotal,
        discountAmount: qt.discountAmount,
        taxableAmount: qt.taxableAmount,
        cgstAmount: qt.cgstAmount,
        sgstAmount: qt.sgstAmount,
        igstAmount: qt.igstAmount,
        totalAmount: qt.totalAmount,
        status: 'accepted',
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ id: quotations.id });
    const quotationId = quotationRow!.id;
    await tx.insert(quotationLines).values(
      LINES.map((l, i) => ({
        tenantId,
        quotationId,
        lineNumber: i + 1,
        productId,
        productSku: PRODUCT.sku,
        productName: PRODUCT.name,
        hsnCode: PRODUCT.hsnCode,
        quantity: l.quantity.toFixed(3),
        unitOfMeasure: 'Nos',
        unitPrice: l.unitPrice.toFixed(2),
        gstRate: PRODUCT.gstRateStored,
        lineTotal: qt.lines[i]!.lineSubtotal,
      })),
    );

    // ── The PI. THIS is the (b) document: Ship-To is in KA, but the arrangement
    //    says the buyer directed delivery there, so the place of supply is the
    //    BILL-TO state. Derived through the same rule the production action uses,
    //    not written as a literal — the F.103 lesson.
    const piPos = BILL_TO.state; // §10(1)(b) selects Bill-To.
    const piTotals = totalsFor(piPos);
    const piNumber = `PI-${fy}-${String(await nextCounter(tx, tenantId, 'performa_invoice', fy)).padStart(4, '0')}`;
    const [piRow] = await tx
      .insert(performaInvoices)
      .values({
        tenantId,
        piNumber,
        quotationId,
        billToDealerId: billToId,
        shipToDealerId: shipToId,
        tenantStateAtIssue: tenantState,
        placeOfSupply: piPos,
        deliveryArrangement: 's10_1_b',
        preparedBy: actorId,
        piDate: docDate,
        validUntil: docDate,
        currency: 'INR',
        subtotal: piTotals.subtotal,
        discountAmount: piTotals.discountAmount,
        taxableAmount: piTotals.taxableAmount,
        cgstAmount: piTotals.cgstAmount,
        sgstAmount: piTotals.sgstAmount,
        igstAmount: piTotals.igstAmount,
        totalAmount: piTotals.totalAmount,
        status: 'confirmed',
        confirmedAt: issuedAt,
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ id: performaInvoices.id });
    const piId = piRow!.id;
    await tx.insert(performaInvoiceLines).values(
      LINES.map((l, i) => ({
        tenantId,
        performaInvoiceId: piId,
        lineNumber: i + 1,
        productId,
        productSku: PRODUCT.sku,
        productName: PRODUCT.name,
        hsnCode: PRODUCT.hsnCode,
        quantity: l.quantity.toFixed(3),
        unitOfMeasure: 'Nos',
        unitPrice: l.unitPrice.toFixed(2),
        gstRate: PRODUCT.gstRateStored,
        lineTotal: piTotals.lines[i]!.lineSubtotal,
      })),
    );

    // ── The order. Copies the PI's state columns AND its arrangement, which is the
    //    behaviour `status-transitions.ts` implements and the invariant test checks.
    const orderNumber = `ORD-${fy}-${String(await nextCounter(tx, tenantId, 'order', fy)).padStart(4, '0')}`;
    const [orderRow] = await tx
      .insert(orders)
      .values({
        tenantId,
        orderNumber,
        performaInvoiceId: piId,
        quotationId,
        billToDealerId: billToId,
        shipToDealerId: shipToId,
        tenantStateAtIssue: tenantState,
        placeOfSupply: piPos,
        deliveryArrangement: 's10_1_b',
        orderDate: docDate,
        currency: 'INR',
        subtotal: piTotals.subtotal,
        discountAmount: piTotals.discountAmount,
        taxableAmount: piTotals.taxableAmount,
        cgstAmount: piTotals.cgstAmount,
        sgstAmount: piTotals.sgstAmount,
        igstAmount: piTotals.igstAmount,
        totalAmount: piTotals.totalAmount,
        status: 'confirmed',
        confirmedAt: issuedAt,
        paymentStatus: 'unpaid',
        createdBy: actorId,
        updatedBy: actorId,
      })
      .returning({ id: orders.id });
    const orderId = orderRow!.id;
    await tx.insert(orderLines).values(
      LINES.map((l, i) => ({
        tenantId,
        orderId,
        lineNumber: i + 1,
        productId,
        productSku: PRODUCT.sku,
        productName: PRODUCT.name,
        hsnCode: PRODUCT.hsnCode,
        quantity: l.quantity.toFixed(3),
        unitOfMeasure: 'Nos',
        unitPrice: l.unitPrice.toFixed(2),
        gstRate: PRODUCT.gstRateStored,
        lineTotal: piTotals.lines[i]!.lineSubtotal,
      })),
    );

    console.log(
      `  · ${TENANT.slug}: ${quoteNumber} → ${piNumber} → ${orderNumber}  ` +
        `billTo=${BILL_TO.state} shipTo=${SHIP_TO.state} arrangement=s10_1_b ` +
        `placeOfSupply=${piPos} (intra-state; under §10(1)(a) it would be ${SHIP_TO.state}, inter-state)`,
    );
  });

  console.log('✓ §10(1)(b) chain seeded.');
  await client.end({ timeout: 5 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
