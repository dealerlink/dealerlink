/**
 * The client demo tenant — MAHARUDRA AGENCIES, Ponda, Goa (F.106).
 *
 * This is the tenant the prospect sees. Everything in it is taken from their own
 * documents in `docs/client-evidence/`: their legal name and address, their bank,
 * the two products they actually sell, and dealers at the delivery addresses that
 * appear on their paperwork.
 *
 * ## Its own tenant, and that is what makes it safe to add
 *
 * This module creates a THIRD tenant rather than seeding into `demo` or `sample`.
 * Document numbers come from `document_counters`, which is keyed on
 * `(tenant_id, doc_type, fiscal_year)`, so a new tenant's counters start at 1 and
 * **cannot shift a number in either existing tenant**. Several are pinned by name —
 * `apps/workers/scripts/typst-matrix.json` addresses seven documents that way and
 * `long-serial-fixture.sql` raises if ORD-2026-0019 is missing. Appending a chain to
 * an existing tenant would have put that at risk; a separate tenant removes the
 * question rather than answering it carefully.
 *
 * It also keeps the client's tenant free of the generic distributor data day5–day13
 * seed, which is the other reason not to add it to `TENANT_SEEDS`: those modules run
 * before this one and would fill it with fixtures that are not theirs.
 *
 * Runs AFTER `multi-rate.ts` and BEFORE `pin-created-at.ts` — after, so no existing
 * allocation moves; before, so its rows get their timestamps pinned like every other
 * seeded row and the renders stay reproducible.
 *
 * ## Three things it deliberately does NOT seed
 *
 * **No discount on any document (operator decision, F.106).** Their system discounts
 * PER LINE — `docs/client-evidence/4.png` puts 11,718.00 on line 1 of PFI-2033 and
 * nothing on line 2 — while Dealerlink models a document-level discount allocated
 * across all lines. The two cannot be made to agree: modelling their per-line figure
 * as a document-level one lands the total 592.28 away from the printed value as an
 * amount, or 55.46 away as a percent, and moves line 2's taxable off its printed
 * 2,350.00. Seeding it would mean fabricating data the model cannot hold, or showing
 * the prospect a total that differs from their own document. **F.111** owns the gap.
 *
 * **No bill-to/ship-to three-party structure (operator decision, F.106).** PFI-2033
 * bills to Ponda, Goa and ships to Kolhapur, Maharashtra, and charges CGST + SGST —
 * their system classifies by BILL-TO. Under ADR-012 Dealerlink would render the same
 * document as IGST. Which is correct is an open statutory question — **F.112**, blocked
 * on their CA — and a demo must not put our system on screen computing a different tax
 * type from their shipped invoice with no confirmed answer. Every document here has
 * ship-to equal to bill-to, so no classification ambiguity arises.
 *
 * **No fabricated GSTIN claim.** The GSTIN below is a checksum-valid FIXTURE carrying
 * Goa's state code 30; it is not theirs, because their documents do not show it. It
 * must be replaced with the real one before the demo — a wrong GSTIN on a tax document
 * is exactly the kind of detail a distributor checks first.
 *
 * ## What it DOES demonstrate
 *
 * Mixed rates across two HSN codes on every document, which is what F.3 and F.4 built:
 * the rate-wise tax block shows a real CGST/SGST pair per rate (or an IGST row per
 * rate), and the HSN/SAC table has more than one row to show. One chain is intra-state
 * and one inter-state, so both tax paths appear.
 *
 * Re-runnable: `db:seed` truncates first, so this rebuilds from scratch each time.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeTax, serializeOutput, type GstRate } from '@dealerlink/tax';
import { hash } from '@node-rs/argon2';
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

import { daysAgo, isoDaysAgo } from './clock';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const DEV_PASSWORD = 'password123';

/** From `docs/client-evidence/4.png` and `5.png` — their letterhead and bank block. */
const TENANT = {
  slug: 'maharudra',
  legalName: 'Maharudra Agencies',
  displayName: 'Maharudra Agencies',
  /** Goa. ISO 3166-2:IN code, per DEV.33 — never a full name. */
  state: 'GA',
  /**
   * FIXTURE, not theirs. Checksum-valid with Goa's state code 30; their documents
   * do not show a GSTIN. Replace before the demo.
   */
  gstin: '30AAFCM1234K1ZV',
  pan: 'AAFCM1234K',
  address: {
    line1: 'Maharudra House, Bldg No. 225/1, Shop No. 1 & 2, Sapna Town',
    city: 'Ponda',
    pincode: '403401',
  },
  bank: {
    name: 'Bank of India',
    account: '103720110000204',
    ifsc: 'BKID0001037',
    branch: 'Tisk Usgao',
  },
  inboundEmailToken: 'mhr-demo-9f2c4a',
} as const;

const USERS = [
  { role: 'admin' as const, name: 'Maharudra Admin' },
  { role: 'sales' as const, name: 'Maharudra Sales' },
  { role: 'accounts' as const, name: 'Maharudra Accounts' },
  { role: 'dispatch' as const, name: 'Maharudra Dispatch' },
];

/** Their two products, with the HSN codes and rates their own documents print. */
const PRODUCTS = [
  {
    sku: 'MHR-PE-620',
    name: 'Premier Energies 620Wp TOPCon DCR',
    hsnCode: '85414300',
    gstRate: '5.00',
    sellingPrice: '15500.00',
    manufacturer: 'Premier Energies',
    category: 'Solar Module',
  },
  {
    sku: 'MHR-EARTH-KIT',
    name: 'Solar Earthing Kit',
    description:
      '17.2MM x 1MTR 3 Nos, Copper Bonded LA 1 No, 15KG BFC Bag 2 Nos, Pit Cover 6" 3 Nos',
    hsnCode: '85359090',
    gstRate: '18.00',
    sellingPrice: '2350.00',
    manufacturer: 'Generic',
    category: 'Earthing',
  },
] as const;

/**
 * Both dealers are BILL-TO AND SHIP-TO. The addresses are the delivery addresses
 * their own documents show, but each is modelled as that dealer's own place of
 * business rather than as a third-party consignee — see the three-party note above.
 */
const DEALERS = [
  {
    key: 'goa',
    dealerCode: 'MHR-D-001',
    displayName: 'Canacona Solar Traders',
    legalName: 'Canacona Solar Traders',
    state: 'GA',
    city: 'Canacona',
    pincode: '403702',
    line1: 'Canacona, South Goa',
    gstin: '30AACCC1234M1ZR',
  },
  {
    key: 'mh',
    dealerCode: 'MHR-D-002',
    displayName: 'Arihant Enterprises',
    legalName: 'Arihant Enterprises',
    state: 'MH',
    city: 'Kolhapur',
    pincode: '416502',
    line1: 'Gadhinglaj Ajara Road, Gadhinglaj',
    gstin: '27AACCA1234M1ZT',
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

/**
 * No discount on any document here — see the header. The parameter is not offered
 * rather than defaulted, so adding one is a deliberate edit and not an oversight.
 */
function totalsFor(lines: LineSpec[], tenantState: string, placeOfSupply: string) {
  return serializeOutput(
    computeTax({
      tenantState,
      placeOfSupply,
      discount: null,
      lines: lines.map((l, i) => ({
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
  const client = postgres(url!, { max: 1 });
  // `casing: snake_case` is REQUIRED, not decorative: the schema declares bare
  // `text()` columns with no explicit name, so without it drizzle emits
  // "legalName" and Postgres rejects the insert. Every other seed module sets it.
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Seeding the client demo tenant (F.106)');

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
      addressLine1: TENANT.address.line1,
      addressCity: TENANT.address.city,
      addressPincode: TENANT.address.pincode,
      addressCountry: 'IN',
      state: TENANT.state,
      bankName: TENANT.bank.name,
      bankAccountNumber: TENANT.bank.account,
      bankIfsc: TENANT.bank.ifsc,
      bankBranch: TENANT.bank.branch,
      primaryColor: '#3730A3',
      defaultTerms:
        'Payment due within agreed credit terms. Goods once sold cannot be returned. Subject to local jurisdiction.',
      inboundEmailToken: TENANT.inboundEmailToken,
    });

    for (const u of USERS) {
      await tx.insert(users).values({
        tenantId,
        email: `${u.role}@${TENANT.slug}.test`,
        passwordHash,
        role: u.role,
        fullName: u.name,
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

    // THE TENANT STATE IS READ BACK, NOT ASSUMED. F.103 removed exactly this class
    // of defect — day12 and day13 hardcoded 'MH' and were wrong for every tenant
    // that was not in Maharashtra. A Goa tenant is the case that would expose it
    // again, so this reads the stored value rather than reusing the constant above.
    const [settings] = await tx
      .select({ state: tenantSettings.state })
      .from(tenantSettings)
      .where(sql`tenant_id = ${tenantId}`)
      .limit(1);
    const tenantState = settings!.state!.toUpperCase();

    const productIds = new Map<string, string>();
    for (const p of PRODUCTS) {
      const [row] = await tx
        .insert(products)
        .values({
          tenantId,
          sku: p.sku,
          name: p.name,
          description: 'description' in p ? p.description : null,
          hsnCode: p.hsnCode,
          gstRate: p.gstRate,
          defaultSellingPrice: p.sellingPrice,
          manufacturer: p.manufacturer,
          category: p.category,
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: products.id });
      productIds.set(p.sku, row!.id);
    }

    const dealerIds = new Map<string, { id: string; state: string }>();
    for (const d of DEALERS) {
      const [row] = await tx
        .insert(dealers)
        .values({
          tenantId,
          dealerCode: d.dealerCode,
          displayName: d.displayName,
          legalName: d.legalName,
          gstin: d.gstin,
          addressLine1: d.line1,
          city: d.city,
          state: d.state,
          pincode: d.pincode,
          country: 'IN',
          status: 'active',
          createdBy: actorId,
          updatedBy: actorId,
        })
        .returning({ id: dealers.id });
      dealerIds.set(d.key, { id: row!.id, state: d.state });
    }

    const meta = (sku: string) => PRODUCTS.find((p) => p.sku === sku)!;
    const spec = (sku: string, quantity: number): LineSpec => {
      const m = meta(sku);
      return {
        sku: m.sku,
        name: m.name,
        hsnCode: m.hsnCode,
        productId: productIds.get(sku)!,
        gstRate: Number(m.gstRate) as GstRate,
        quantity,
        unitPrice: Number(m.sellingPrice),
      };
    };

    const fy = fiscalYearOf(daysAgo(0));
    let quotationCount = 0;
    let piCount = 0;
    let orderCount = 0;

    async function buildChain(
      label: string,
      lines: LineSpec[],
      dealerKey: string,
      daysAgoIssued: number,
    ): Promise<void> {
      const dealer = dealerIds.get(dealerKey)!;

      // PLACE OF SUPPLY IS DERIVED FROM THE SHIP-TO DEALER (ADR-012), never
      // hardcoded. Ship-to equals bill-to on every document here, so this reduces
      // to that dealer's own state and carries no three-party ambiguity.
      const placeOfSupply = dealer.state.toUpperCase();
      const totals = totalsFor(lines, tenantState, placeOfSupply);

      const quoteDate = daysAgo(daysAgoIssued);
      const quoteSeq = await nextCounter(tx, tenantId, 'quotation', fy);
      const quoteNumber = `QT-${fy}-${String(quoteSeq).padStart(4, '0')}`;
      const [quote] = await tx
        .insert(quotations)
        .values({
          tenantId,
          quoteNumber,
          revision: 1,
          dealId: null,
          dealerId: dealer.id,
          preparedBy: actorId,
          tenantStateAtIssue: tenantState,
          placeOfSupply,
          quoteDate: quoteDate.toISOString().slice(0, 10),
          validUntil: isoDaysAgo(daysAgoIssued - 30),
          currency: 'INR',
          subtotal: totals.subtotal,
          discountType: null,
          discountValue: null,
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
        },
        {
          tenantId,
          quotationId: quote!.id,
          fromStatus: 'draft' as const,
          toStatus: 'sent' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(quoteDate.getTime() + 60_000),
        },
        {
          tenantId,
          quotationId: quote!.id,
          fromStatus: 'sent' as const,
          toStatus: 'accepted' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(quoteDate.getTime() + 2 * 86_400_000),
        },
      ]);

      const piDate = daysAgo(daysAgoIssued - 3);
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
          validUntil: isoDaysAgo(daysAgoIssued - 33),
          currency: 'INR',
          subtotal: totals.subtotal,
          discountType: null,
          discountValue: null,
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          totalAmount: totals.totalAmount,
          status: 'confirmed',
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
        },
        {
          tenantId,
          performaInvoiceId: pi!.id,
          fromStatus: 'draft' as const,
          toStatus: 'sent' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(piDate.getTime() + 60_000),
        },
        {
          tenantId,
          performaInvoiceId: pi!.id,
          fromStatus: 'sent' as const,
          toStatus: 'confirmed' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(piDate.getTime() + 86_400_000),
        },
      ]);

      const orderDate = daysAgo(daysAgoIssued - 5);
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
          discountAmount: totals.discountAmount,
          taxableAmount: totals.taxableAmount,
          cgstAmount: totals.cgstAmount,
          sgstAmount: totals.sgstAmount,
          igstAmount: totals.igstAmount,
          totalAmount: totals.totalAmount,
          status: 'confirmed',
          paymentStatus: 'unpaid',
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
        },
        {
          tenantId,
          orderId: order!.id,
          fromStatus: 'pending' as const,
          toStatus: 'confirmed' as const,
          transitionedBy: actorId,
          transitionedAt: new Date(orderDate.getTime() + 3_600_000),
        },
      ]);

      console.log(`  · ${label}: ${quoteNumber} → PI → ${orderNumber} (${lines.length} lines)`);
    }

    // Both chains carry BOTH products, so both rates and both HSN codes appear on
    // every document — which is what gives the rate-wise block and the HSN/SAC
    // table something real to show.
    await buildChain(
      'Intra-state (Goa → Goa, CGST + SGST)',
      [spec('MHR-PE-620', 26), spec('MHR-EARTH-KIT', 2)],
      'goa',
      24,
    );
    await buildChain(
      'Inter-state (Goa → Maharashtra, IGST)',
      [spec('MHR-PE-620', 36), spec('MHR-EARTH-KIT', 1)],
      'mh',
      16,
    );

    console.log(
      `  · ${PRODUCTS.length} products, ${DEALERS.length} dealers, ${quotationCount} quotations, ${piCount} PIs, ${orderCount} orders`,
    );
  });

  await client.end({ timeout: 5 });
  console.log('✓ Client demo seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Client demo seed failed:', err);
  process.exit(1);
});
