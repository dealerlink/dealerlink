/**
 * Day 2 seed: 2 tenants, 8 tenant users, 1 platform operator.
 * Day 13+ will extend this with dealers, products, inventory, deals.
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hash } from '@node-rs/argon2';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { tenants, tenantSettings, users } from '../schema';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const DEV_PASSWORD = 'password123';

async function hashDevPassword(): Promise<string> {
  return hash(DEV_PASSWORD, {
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
    algorithm: 2,
  });
}

interface TenantSeed {
  slug: string;
  legalName: string;
  displayName: string;
  state: string;
  gstin: string;
  pan: string;
  bank: { name: string; account: string; ifsc: string; branch: string };
  address: { line1: string; city: string; pincode: string };
  inboundEmailToken: string;
}

const TENANT_SEEDS: TenantSeed[] = [
  {
    slug: 'demo',
    legalName: 'Demo Solar Distributors Pvt Ltd',
    displayName: 'Demo Solar Distributors',
    state: 'Maharashtra',
    gstin: '27AABCD1234E1Z8',
    pan: 'AABCD1234E',
    bank: {
      name: 'HDFC Bank',
      account: '50200012345678',
      ifsc: 'HDFC0001234',
      branch: 'Andheri East, Mumbai',
    },
    address: {
      line1: '4th Floor, Solitaire Corporate Park, Andheri East',
      city: 'Mumbai',
      pincode: '400093',
    },
    inboundEmailToken: 'demo-' + randomUUID().slice(0, 8),
  },
  {
    slug: 'sample',
    legalName: 'Sample Industrial Co Pvt Ltd',
    displayName: 'Sample Industrial Co',
    state: 'Karnataka',
    gstin: '29AABCS9999P1ZY',
    pan: 'AABCS9999P',
    bank: {
      name: 'ICICI Bank',
      account: '003205501234',
      ifsc: 'ICIC0000032',
      branch: 'Koramangala, Bangalore',
    },
    address: {
      line1: '12, 5th Block, Koramangala',
      city: 'Bangalore',
      pincode: '560095',
    },
    inboundEmailToken: 'sample-' + randomUUID().slice(0, 8),
  },
];

const TENANT_USER_TEMPLATE: { role: 'admin' | 'sales' | 'accounts' | 'dispatch'; name: string }[] =
  [
    { role: 'admin', name: 'Tenant Admin' },
    { role: 'sales', name: 'Sales Lead' },
    { role: 'accounts', name: 'Accounts Manager' },
    { role: 'dispatch', name: 'Dispatch Lead' },
  ];

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  console.log('→ Truncating existing data');
  // CASCADE handles all FK dependencies.
  await client.unsafe(`
    TRUNCATE TABLE
      auth_events,
      audit_log,
      access_log,
      email_delivery_log,
      inbound_token_history,
      sessions,
      inventory_items,
      procurements,
      products,
      dealers,
      document_counters,
      tenant_settings,
      users,
      tenants
    RESTART IDENTITY CASCADE;
  `);

  console.log('→ Hashing dev password');
  const passwordHash = await hashDevPassword();

  const credentials: { email: string; tenant: string; role: string }[] = [];

  for (const seed of TENANT_SEEDS) {
    const tenantId = randomUUID();
    console.log(`→ Seeding tenant "${seed.slug}" (${tenantId})`);

    // tenants has no RLS — straight insert
    await db.insert(tenants).values({
      id: tenantId,
      slug: seed.slug,
      legalName: seed.legalName,
      displayName: seed.displayName,
      status: 'active',
    });

    // tenant_settings has FORCE RLS — set context first
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
      await tx.insert(tenantSettings).values({
        tenantId,
        gstin: seed.gstin,
        pan: seed.pan,
        addressLine1: seed.address.line1,
        addressCity: seed.address.city,
        addressPincode: seed.address.pincode,
        addressCountry: 'IN',
        state: seed.state,
        bankName: seed.bank.name,
        bankAccountNumber: seed.bank.account,
        bankIfsc: seed.bank.ifsc,
        bankBranch: seed.bank.branch,
        primaryColor: '#3730A3',
        defaultTerms:
          'Payment due within agreed credit terms. Goods once sold cannot be returned. Subject to local jurisdiction.',
        inboundEmailToken: seed.inboundEmailToken,
      });

      for (const u of TENANT_USER_TEMPLATE) {
        const email = `${u.role}@${seed.slug}.test`;
        await tx.insert(users).values({
          tenantId,
          email,
          passwordHash,
          role: u.role,
          fullName: u.name,
          status: 'active',
          // Seed users have "already rotated" — they log straight into the
          // app, no force-password-change screen. The column default is
          // false; we set it explicitly so the intent is unmistakable and the
          // Day-1..18 E2E specs keep passing unchanged (DEV.56 / Stage C C.1).
          mustChangePassword: false,
        });
        credentials.push({ email, tenant: seed.displayName, role: u.role });
      }
    });
  }

  console.log('→ Seeding platform operator');
  await db.transaction(async (tx) => {
    // Operator: tenant_id IS NULL. RLS policy requires app.tenant_id unset.
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    await tx.insert(users).values({
      tenantId: null,
      email: 'operator@dealerlink.test',
      passwordHash,
      role: 'operator',
      fullName: 'Platform Operator',
      status: 'active',
      // Seeded operator logs straight into /admin — see note above.
      mustChangePassword: false,
    });
  });
  credentials.push({
    email: 'operator@dealerlink.test',
    tenant: '— (platform)',
    role: 'operator',
  });

  console.log('\n──────────────────────────────────────────────────────────────');
  console.log('  ⚠  DEV-ONLY CREDENTIALS — DO NOT USE IN PRODUCTION');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  Password (all users): ${DEV_PASSWORD}\n`);
  for (const c of credentials) {
    console.log(`  · ${c.email.padEnd(34)}  ${c.role.padEnd(10)}  ${c.tenant}`);
  }
  console.log('──────────────────────────────────────────────────────────────\n');

  await client.end({ timeout: 5 });
}

main().catch((err: unknown) => {
  console.error('✗ Seed failed:', err);
  process.exit(1);
});
