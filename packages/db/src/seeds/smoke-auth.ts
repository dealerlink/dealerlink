/**
 * Day 2 auth smoke. Verifies seeded password hashes verify correctly.
 * Run with: pnpm --filter @dealerlink/db exec tsx src/seeds/smoke-auth.ts
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hash, verify } from '@node-rs/argon2';
import { config as loadEnv } from 'dotenv';
import { eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../schema';
import { users } from '../schema';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL not set');

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  // operator login (no tenant)
  const [operator] = await db.select().from(users).where(isNull(users.tenantId)).limit(1);
  if (!operator) throw new Error('operator user missing');
  const opOk = await verify(operator.passwordHash, 'password123');
  console.log(`operator@dealerlink.test verify: ${opOk ? 'PASS' : 'FAIL'}`);

  // tenant user login (demo admin) — must look up by tenant slug first
  // (matching the production login flow, which scopes by tenantSlug)
  const [demoTenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, 'demo'))
    .limit(1);
  if (!demoTenant) throw new Error('demo tenant missing');
  const admin = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${demoTenant.id}, true)`);
    const [u] = await tx.select().from(users).where(eq(users.email, 'admin@demo.test')).limit(1);
    return u;
  });
  if (!admin) throw new Error('demo admin missing');
  const adminOk = await verify(admin.passwordHash, 'password123');
  console.log(`admin@demo.test verify: ${adminOk ? 'PASS' : 'FAIL'}`);

  // bad password
  const adminBad = await verify(admin.passwordHash, 'wrongpassword');
  console.log(`admin@demo.test bad password: ${adminBad ? 'FAIL (should be false)' : 'PASS'}`);

  // Hash perf check (Argon2 timing)
  const t = Date.now();
  await hash('password123', { memoryCost: 19_456, timeCost: 2, parallelism: 1, algorithm: 2 });
  console.log(`Argon2 hash time: ${Date.now() - t}ms`);

  await client.end({ timeout: 5 });
  if (!opOk || !adminOk || adminBad) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
