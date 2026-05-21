/**
 * Staging DB bootstrap — one-shot, idempotent.
 *
 * Reproduces what scripts/init-db.sql does on the local Docker container, but
 * for a fresh DO Managed Postgres cluster where we cannot drop SQL into
 * /docker-entrypoint-initdb.d.
 *
 * Two phases controlled by env STAGING_BOOTSTRAP_PHASE:
 *   - `pre`     (before migrations) — creates the named DB + extensions DO's
 *                migrations don't create themselves (uuid-ossp, btree_gin).
 *                pg_trgm is created by migration 0004.
 *   - `finalize` (after migrations + seed) — rotates the dealerlink_app role
 *                password away from the dev default that 00-app-role.sql ships
 *                with, to the staging-specific value passed in env.
 *
 * Required env:
 *   STAGING_ADMIN_DEFAULTDB_URL   doadmin URI pointing at the cluster's
 *                                 defaultdb. Used only in `pre` to create the
 *                                 named DB (CREATE DATABASE cannot run inside
 *                                 a transaction, so it must run outside the
 *                                 target DB).
 *   STAGING_ADMIN_TARGET_URL      doadmin URI pointing at dealerlink_staging.
 *                                 Used in both phases for everything else.
 *   STAGING_DB_NAME               e.g. dealerlink_staging
 *   STAGING_APP_PASSWORD          (finalize only) new password for dealerlink_app
 *
 * Usage (pwsh):
 *   $env:STAGING_BOOTSTRAP_PHASE='pre';      node scripts/staging-db-bootstrap.mjs
 *   $env:STAGING_BOOTSTRAP_PHASE='finalize'; node scripts/staging-db-bootstrap.mjs
 */
import postgres from 'postgres';

const phase = process.env.STAGING_BOOTSTRAP_PHASE;
if (phase !== 'pre' && phase !== 'finalize') {
  console.error('STAGING_BOOTSTRAP_PHASE must be "pre" or "finalize"');
  process.exit(2);
}

const dbName = process.env.STAGING_DB_NAME;
if (!dbName) {
  console.error('STAGING_DB_NAME is required');
  process.exit(2);
}
if (!/^[a-z][a-z0-9_]*$/.test(dbName)) {
  console.error(`STAGING_DB_NAME ${JSON.stringify(dbName)} must be a safe identifier`);
  process.exit(2);
}

async function runPre() {
  const defaultdbUrl = process.env.STAGING_ADMIN_DEFAULTDB_URL;
  const targetUrl = process.env.STAGING_ADMIN_TARGET_URL;
  if (!defaultdbUrl || !targetUrl) {
    console.error('STAGING_ADMIN_DEFAULTDB_URL and STAGING_ADMIN_TARGET_URL required for `pre`');
    process.exit(2);
  }

  console.log('→ Connecting to defaultdb');
  const defaultClient = postgres(defaultdbUrl, { max: 1, prepare: false });
  try {
    const existing =
      await defaultClient`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (existing.length === 0) {
      console.log(`→ CREATE DATABASE ${dbName}`);
      // Identifier is regex-validated above; safe to inline.
      await defaultClient.unsafe(`CREATE DATABASE ${dbName}`);
    } else {
      console.log(`  · database ${dbName} already exists, skipping CREATE`);
    }
  } finally {
    await defaultClient.end({ timeout: 5 });
  }

  console.log(`→ Connecting to ${dbName}`);
  const targetClient = postgres(targetUrl, { max: 1, prepare: false });
  try {
    for (const ext of ['uuid-ossp', 'btree_gin']) {
      console.log(`  · CREATE EXTENSION IF NOT EXISTS "${ext}"`);
      await targetClient.unsafe(`CREATE EXTENSION IF NOT EXISTS "${ext}"`);
    }
    const installed = await targetClient`
      SELECT extname, extversion FROM pg_extension ORDER BY extname
    `;
    console.log('→ Extensions installed:');
    for (const row of installed) console.log(`  · ${row.extname} ${row.extversion}`);
  } finally {
    await targetClient.end({ timeout: 5 });
  }

  console.log('✓ pre phase complete');
}

async function runFinalize() {
  const targetUrl = process.env.STAGING_ADMIN_TARGET_URL;
  const appPassword = process.env.STAGING_APP_PASSWORD;
  if (!targetUrl || !appPassword) {
    console.error('STAGING_ADMIN_TARGET_URL and STAGING_APP_PASSWORD required for `finalize`');
    process.exit(2);
  }

  console.log(`→ Connecting to ${dbName} to rotate dealerlink_app password`);
  const client = postgres(targetUrl, { max: 1, prepare: false });
  try {
    const found = await client`SELECT 1 FROM pg_roles WHERE rolname = 'dealerlink_app'`;
    if (found.length === 0) {
      console.error('  ✗ dealerlink_app role missing — run migrations first');
      process.exit(1);
    }
    // Parameter binding doesn't work for ALTER ROLE; quote-escape inline.
    const escaped = appPassword.replace(/'/g, "''");
    await client.unsafe(`ALTER ROLE dealerlink_app PASSWORD '${escaped}'`);
    console.log('  · password rotated');
    // Sanity check: confirm the role is still NOLOGIN-NOBYPASSRLS-incapable
    // (00-app-role.sql ALTERs it NOSUPERUSER NOBYPASSRLS) and can LOGIN.
    const attrs = await client`
      SELECT rolcanlogin, rolsuper, rolbypassrls
      FROM pg_roles WHERE rolname = 'dealerlink_app'
    `;
    console.log(`  · attrs: ${JSON.stringify(attrs[0])}`);
    if (attrs[0].rolsuper || attrs[0].rolbypassrls || !attrs[0].rolcanlogin) {
      console.error('  ✗ dealerlink_app attributes are wrong — RLS would be bypassed');
      process.exit(1);
    }
  } finally {
    await client.end({ timeout: 5 });
  }

  console.log('✓ finalize phase complete');
}

if (phase === 'pre') {
  await runPre();
} else {
  await runFinalize();
}
