/**
 * Day 5 seed extension: dealers + products per docs/SEED_DATA.md.
 * 20 dealers per tenant across mixed states/types/categories/risk levels.
 * 20 products per tenant from Premier Energies, Adani Solar, Vikram Solar.
 *
 * Run AFTER the base seed (index.ts) — this script reuses the tenants and
 * users created there.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { dealers, products, tenants, users } from '../schema';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// ---------------------------------------------------------------------------
// GSTIN generator — produces format-valid checksum-correct GSTINs
// ---------------------------------------------------------------------------
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function gstinCheckChar(prefix14: string): string {
  let sum = 0;
  let factor = 1;
  for (let i = 0; i < 14; i++) {
    const ch = prefix14[i]!;
    const v = CHARSET.indexOf(ch);
    const prod = v * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
    factor = factor === 1 ? 2 : 1;
  }
  const check = (36 - (sum % 36)) % 36;
  return CHARSET[check]!;
}

function makeGSTIN(stateCode: string, panSeed: number, entity = '1'): string {
  // Build a synthetic PAN: ABCDE + 4 digits + A
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const a = (panSeed * 7) % letters.length;
  const b = (panSeed * 11) % letters.length;
  const c = (panSeed * 13) % letters.length;
  const d = (panSeed * 17) % letters.length;
  const e = (panSeed * 19) % letters.length;
  const f = (panSeed * 23) % letters.length;
  const pan = `${letters[a]}${letters[b]}${letters[c]}${letters[d]}${letters[e]}${String(panSeed).padStart(4, '0').slice(0, 4)}${letters[f]}`;
  const prefix = `${stateCode}${pan}${entity}Z`;
  return `${prefix}${gstinCheckChar(prefix)}`;
}

function panFromGSTIN(g: string): string {
  return g.slice(2, 12);
}

// ---------------------------------------------------------------------------
// Dealer seed data
// ---------------------------------------------------------------------------
interface StateInfo {
  code: string;
  name: string;
  cities: string[];
}

const STATES: StateInfo[] = [
  { code: '27', name: 'Maharashtra', cities: ['Mumbai', 'Pune', 'Nashik'] },
  { code: '18', name: 'Assam', cities: ['Guwahati', 'Dibrugarh'] },
  { code: '29', name: 'Karnataka', cities: ['Bangalore', 'Mysore'] },
  { code: '33', name: 'Tamil Nadu', cities: ['Chennai', 'Coimbatore'] },
  { code: '24', name: 'Gujarat', cities: ['Ahmedabad', 'Surat', 'Vadodara'] },
  { code: '09', name: 'Uttar Pradesh', cities: ['Lucknow', 'Kanpur', 'Noida'] },
  { code: '08', name: 'Rajasthan', cities: ['Jaipur', 'Jodhpur'] },
];

const INDIAN_FIRSTS = [
  'Aarav',
  'Vivaan',
  'Aditya',
  'Reyansh',
  'Krishna',
  'Ishaan',
  'Arjun',
  'Rohan',
  'Kabir',
  'Aryan',
  'Saanvi',
  'Aanya',
  'Diya',
  'Priya',
  'Anika',
  'Riya',
  'Pooja',
  'Neha',
  'Kavya',
  'Sneha',
];

const INDIAN_LASTS = [
  'Sharma',
  'Verma',
  'Iyer',
  'Patel',
  'Kapoor',
  'Reddy',
  'Singh',
  'Mehta',
  'Joshi',
  'Nair',
  'Pillai',
  'Bhatia',
  'Khanna',
  'Mishra',
  'Kulkarni',
  'Desai',
  'Rao',
  'Gupta',
  'Saxena',
  'Bhat',
];

const DEALER_BIZ_SUFFIXES = [
  'Solar Solutions',
  'Renewables Pvt Ltd',
  'Power Systems',
  'Energy Co',
  'EnerTech',
  'Green Power',
  'Solar Mart',
  'Sun Industries',
  'Electricals',
];

const TAG_POOL = ['priority', 'distributor', 'rooftop', 'commercial', 'industrial', 'epc-partner'];

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length]!;
}

interface DealerSpec {
  legalName: string;
  displayName: string;
  contactPerson: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
  pan: string;
  type: 'retailer' | 'wholesaler' | 'installer' | 'epc' | 'other';
  category: 'A' | 'B' | 'C';
  riskLevel: 'low' | 'medium' | 'high';
  creditLimit: string | null;
  creditPeriodDays: number | null;
  discountPercent: string;
  tags: string[];
}

function generateDealersForTenant(slug: string, n: number): DealerSpec[] {
  // 10 retailer, 5 wholesaler, 3 installer, 2 epc — 20 total
  const TYPES: DealerSpec['type'][] = [
    ...Array(10).fill('retailer' as const),
    ...Array(5).fill('wholesaler' as const),
    ...Array(3).fill('installer' as const),
    ...Array(2).fill('epc' as const),
  ];
  // 5 A, 10 B, 5 C
  const CATS: DealerSpec['category'][] = [
    ...Array(5).fill('A' as const),
    ...Array(10).fill('B' as const),
    ...Array(5).fill('C' as const),
  ];
  // 3 high, 5 medium, 12 low
  const RISKS: DealerSpec['riskLevel'][] = [
    ...Array(3).fill('high' as const),
    ...Array(5).fill('medium' as const),
    ...Array(12).fill('low' as const),
  ];

  const out: DealerSpec[] = [];
  for (let i = 0; i < n; i++) {
    const state = STATES[i % STATES.length]!;
    const city = state.cities[i % state.cities.length]!;
    const first = INDIAN_FIRSTS[i % INDIAN_FIRSTS.length]!;
    const last = INDIAN_LASTS[(i * 3) % INDIAN_LASTS.length]!;
    const biz = DEALER_BIZ_SUFFIXES[i % DEALER_BIZ_SUFFIXES.length]!;
    const legalName = `${last} ${biz}`;
    const displayName = `${last} ${biz.split(' ')[0]}`;
    const panSeed = (slug.charCodeAt(0) ?? 65) * 1000 + i * 7 + 17;
    const gstin = makeGSTIN(state.code, panSeed, '1');
    const pan = panFromGSTIN(gstin);

    const hasCredit = i % 2 === 0;
    const type = TYPES[i]!;
    const category = CATS[i]!;
    const risk = RISKS[i]!;

    out.push({
      legalName,
      displayName,
      contactPerson: `${first} ${last}`,
      phone: `+91 ${9000000000 + (((slug.charCodeAt(0) + i) * 91737) % 999999999)}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${slug}-${i}.example.in`,
      addressLine1: `${100 + i}, ${biz.split(' ')[0]} Road`,
      city,
      state: state.name,
      pincode: `${state.code}000${i.toString().padStart(2, '0')}`.slice(0, 6),
      gstin,
      pan,
      type,
      category,
      riskLevel: risk,
      creditLimit: hasCredit
        ? String((category === 'A' ? 50 : category === 'B' ? 20 : 10) * 100000)
        : null,
      creditPeriodDays: hasCredit ? (category === 'A' ? 45 : 30) : null,
      discountPercent: category === 'A' ? '3' : category === 'B' ? '1.5' : '0',
      tags: [pick(TAG_POOL, i), pick(TAG_POOL, i + 3)].filter(
        (t, idx, arr) => arr.indexOf(t) === idx,
      ),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Product seed data
// ---------------------------------------------------------------------------
interface ProductSpec {
  sku: string;
  name: string;
  manufacturer: string;
  model: string;
  hsnCode: string;
  gstRate: string;
  category: string;
  subcategory: string;
  specs: Record<string, string | number>;
  mrp: string;
  defaultPurchasePrice: string;
  defaultSellingPrice: string;
  requiresSerial: boolean;
}

function generateProducts(): ProductSpec[] {
  const out: ProductSpec[] = [];
  const PRE_WATTAGES = [400, 450, 500, 540, 580, 600, 650];
  PRE_WATTAGES.forEach((w, i) => {
    const subcategory = i % 2 === 0 ? 'TOPCon' : 'Bifacial';
    out.push({
      sku: `PRE-${w}-${subcategory.slice(0, 2).toUpperCase()}`,
      name: `Premier ${w}W ${subcategory}`,
      manufacturer: 'Premier Energies',
      model: `PRE-${w}${subcategory.slice(0, 2).toUpperCase()}`,
      hsnCode: '85414300',
      gstRate: '18',
      category: 'Solar Panel',
      subcategory,
      specs: {
        wattage: w,
        voltage: 41.2 + i * 0.5,
        cells: 144,
        efficiency: 21 + i * 0.2,
        warranty_years: 25,
      },
      mrp: String(w * 30),
      defaultPurchasePrice: String(w * 20),
      defaultSellingPrice: String(w * 26),
      requiresSerial: true,
    });
  });

  const ADANI_WATTAGES = [445, 540, 580, 605, 630, 650];
  ADANI_WATTAGES.forEach((w, i) => {
    out.push({
      sku: `ADL-${w}-MP`,
      name: `Adani ${w}W Mono PERC`,
      manufacturer: 'Adani Solar',
      model: `ADL-${w}MP`,
      hsnCode: '85414300',
      gstRate: '18',
      category: 'Solar Panel',
      subcategory: 'Mono PERC',
      specs: {
        wattage: w,
        voltage: 40 + i * 0.5,
        cells: 144,
        efficiency: 20.5 + i * 0.2,
        warranty_years: 25,
      },
      mrp: String(w * 28),
      defaultPurchasePrice: String(w * 19),
      defaultSellingPrice: String(w * 25),
      requiresSerial: true,
    });
  });

  const VIKRAM_WATTAGES = [440, 530, 550, 575, 590, 610, 630];
  VIKRAM_WATTAGES.forEach((w, i) => {
    out.push({
      sku: `VIK-${w}-BF`,
      name: `Vikram ${w}W Bifacial`,
      manufacturer: 'Vikram Solar',
      model: `VIK-${w}BF`,
      hsnCode: '85414300',
      gstRate: '18',
      category: 'Solar Panel',
      subcategory: 'Bifacial',
      specs: {
        wattage: w,
        voltage: 41 + i * 0.4,
        cells: 144,
        efficiency: 21.3 + i * 0.15,
        warranty_years: 25,
      },
      mrp: String(w * 29),
      defaultPurchasePrice: String(w * 20),
      defaultSellingPrice: String(w * 26),
      requiresSerial: true,
    });
  });
  return out;
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Day 5 seed: dealers + products');

  // Truncate so re-running is clean.
  await client.unsafe(`
    TRUNCATE TABLE
      inventory_items,
      procurements,
      products,
      dealers,
      document_counters
    RESTART IDENTITY CASCADE;
  `);

  const tenantRows = await db.select().from(tenants);
  for (const t of tenantRows) {
    if (t.status !== 'active') continue;
    console.log(`  · Tenant ${t.slug}`);

    // Need an admin user to attribute as created_by.
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`tenant_id = ${t.id} AND role = 'admin'`)
      .limit(1);
    const adminId = admin?.id ?? null;

    const dealerSpecs = generateDealersForTenant(t.slug, 20);
    const productSpecs = generateProducts();

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${t.id}, true)`);
      await tx.execute(sql`SELECT set_config('app.user_id', ${adminId ?? ''}, true)`);

      // Dealers — generate codes via document_counters
      for (const d of dealerSpecs) {
        const result = await tx.execute<{ last_value: string | number }>(sql`
          INSERT INTO document_counters (tenant_id, doc_type, fiscal_year, last_value)
          VALUES (${t.id}, 'dealer', 0, 1)
          ON CONFLICT (tenant_id, doc_type, fiscal_year)
          DO UPDATE SET last_value = document_counters.last_value + 1, updated_at = now()
          RETURNING last_value
        `);
        const seq = Number((result as unknown as { last_value: string | number }[])[0]!.last_value);
        const dealerCode = `DL-${String(seq).padStart(6, '0')}`;
        await tx.insert(dealers).values({
          tenantId: t.id,
          dealerCode,
          legalName: d.legalName,
          displayName: d.displayName,
          contactPerson: d.contactPerson,
          phone: d.phone,
          email: d.email,
          addressLine1: d.addressLine1,
          city: d.city,
          state: d.state,
          pincode: d.pincode,
          country: 'IN',
          gstin: d.gstin,
          pan: d.pan,
          type: d.type,
          category: d.category,
          riskLevel: d.riskLevel,
          creditLimit: d.creditLimit,
          creditPeriodDays: d.creditPeriodDays,
          discountPercent: d.discountPercent,
          tags: d.tags,
          createdBy: adminId,
          updatedBy: adminId,
        });
      }

      // Products
      for (const p of productSpecs) {
        await tx.insert(products).values({
          tenantId: t.id,
          sku: p.sku,
          name: p.name,
          manufacturer: p.manufacturer,
          model: p.model,
          hsnCode: p.hsnCode,
          gstRate: p.gstRate,
          category: p.category,
          subcategory: p.subcategory,
          specs: p.specs,
          mrp: p.mrp,
          defaultPurchasePrice: p.defaultPurchasePrice,
          defaultSellingPrice: p.defaultSellingPrice,
          requiresSerial: p.requiresSerial,
          unitOfMeasure: 'Nos',
          createdBy: adminId,
          updatedBy: adminId,
        });
      }
    });

    console.log(`    ✓ ${dealerSpecs.length} dealers, ${productSpecs.length} products`);
  }

  await client.end({ timeout: 5 });
  console.log('✓ Day 5 seed complete.');
}

main().catch((err: unknown) => {
  console.error('✗ Day 5 seed failed:', err);
  process.exit(1);
});
