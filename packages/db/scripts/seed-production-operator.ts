/**
 * Production operator seed — operator account ONLY.
 *
 * Unlike src/seeds/index.ts (the dev/staging seed) this script:
 *   - does NOT truncate anything;
 *   - does NOT create demo/sample tenants or tenant users (production has no
 *     seed data — the real pilot tenant is provisioned by the operator in
 *     Stage E, CLAUDE.md §1 / STAGE_D_HANDOFF §9);
 *   - is idempotent: if the operator already exists it leaves it untouched and
 *     exits 0 (it never overwrites a password);
 *   - generates a strong RANDOM temp password, prints it to the console ONCE,
 *     and sets must_change_password=true so the operator is forced through the
 *     /change-password trapdoor on first login (ADR-010, C.1 / DEV.56).
 *
 * Required env:
 *   PROD_OPERATOR_EMAIL     the real operator email (monitored mailbox)
 *   DATABASE_DIRECT_URL     doadmin URI to dealerlink_production (or DATABASE_URL)
 *
 * Usage (pwsh, from repo root):
 *   $env:PROD_OPERATOR_EMAIL='dealerlink.io@gmail.com'
 *   $env:DATABASE_DIRECT_URL='postgres://doadmin:...@.../dealerlink_production?sslmode=require'
 *   pnpm --filter @dealerlink/db exec tsx scripts/seed-production-operator.ts
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hash } from '@node-rs/argon2';
import { config as loadEnv } from 'dotenv';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from '../src/schema';
import { users } from '../src/schema';

const here =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadEnv({ path: path.resolve(repoRoot, '.env.local') });
loadEnv({ path: path.resolve(repoRoot, '.env') });

const email = process.env.PROD_OPERATOR_EMAIL?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('PROD_OPERATOR_EMAIL must be a valid email address');
  process.exit(2);
}

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_DIRECT_URL (or DATABASE_URL) is required');
  process.exit(2);
}

/**
 * Strong temp password that satisfies the §6 policy (>=8 chars, >=1 upper,
 * >=1 number, >=1 special). The login itself only hashes; the policy is
 * enforced on the NEW password at rotation — but a compliant temp keeps the
 * value clean and avoids surprising the operator. ~22 chars / ~128 bits.
 */
function generateTempPassword(): string {
  const core = randomBytes(18).toString('base64url'); // [A-Za-z0-9-_], 24 chars
  // Guarantee one of each required class regardless of base64url output.
  return `Dl7!${core}`;
}

async function main() {
  const client = postgres(url!, { max: 1, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });

  try {
    // Operator rows have tenant_id IS NULL. The users RLS policy requires
    // app.tenant_id to be unset/empty for those rows to be visible/insertable.
    const existing = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
      return tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(and(isNull(users.tenantId), eq(users.role, 'operator'), eq(users.email, email!)))
        .limit(1);
    });

    if (existing.length > 0) {
      console.log(`\n✓ Operator ${email} already exists (id ${existing[0]!.id}).`);
      console.log('  Nothing to do — this script never overwrites an existing operator.');
      console.log('  To reset its password, use the operator password-reset flow in /admin.\n');
      return;
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hash(tempPassword, {
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      algorithm: 2,
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
      await tx.insert(users).values({
        tenantId: null,
        email: email!,
        passwordHash,
        role: 'operator',
        fullName: 'Platform Operator',
        status: 'active',
        // Forced through /change-password on first login (ADR-010 / C.1).
        mustChangePassword: true,
      });
    });

    console.log('\n──────────────────────────────────────────────────────────────');
    console.log('  PRODUCTION OPERATOR CREATED — copy this temp password NOW');
    console.log('  (it is shown once; the operator must change it on first login)');
    console.log('──────────────────────────────────────────────────────────────');
    console.log(`  Email:          ${email}`);
    console.log(`  Temp password:  ${tempPassword}`);
    console.log(`  Role:           operator`);
    console.log(`  Login at:       https://app.dealerlink.in  (forced /change-password)`);
    console.log('──────────────────────────────────────────────────────────────\n');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error('✗ Operator seed failed:', err);
  process.exit(1);
});
