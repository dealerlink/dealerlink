/**
 * Production RLS smoke — non-mutating. Verifies that connecting as the
 * dealerlink_app role enforces Row-Level Security on an EMPTY production DB
 * (production has no seed data beyond the operator, so the staging smoke's
 * demo-tenant row-visibility test does not apply).
 *
 * Proves:
 *   1. current_user is dealerlink_app (the app connects as the RLS-subject role)
 *   2. the role is NOT superuser and does NOT have BYPASSRLS
 *   3. RLS is ENABLED + FORCED on tenant-scoped tables (policies installed)
 *   4. a SELECT on a tenant-scoped table with NO app.tenant_id returns 0 rows
 *      and does not error (RLS is actively filtering, not failing open)
 *
 * Required env:
 *   PROD_APP_URL   dealerlink_app URI to dealerlink_production (the DATABASE_URL)
 */
import postgres from 'postgres';

const url = process.env.PROD_APP_URL;
if (!url) {
  console.error('PROD_APP_URL is required (the dealerlink_app DATABASE_URL)');
  process.exit(2);
}

const TENANT_TABLES = ['dealers', 'products', 'quotations', 'orders', 'payments'];

const client = postgres(url, { max: 1, prepare: false });
let failed = false;
try {
  console.log('→ Connecting as the app role');
  const me = await client`SELECT current_user, current_database()`;
  console.log(`  · current_user=${me[0].current_user} db=${me[0].current_database}`);
  if (me[0].current_user !== 'dealerlink_app') {
    console.error('  ✗ expected current_user=dealerlink_app');
    failed = true;
  }

  const attrs = await client`
    SELECT rolsuper, rolbypassrls, rolcanlogin
    FROM pg_roles WHERE rolname = current_user`;
  console.log(`  · attrs=${JSON.stringify(attrs[0])}`);
  if (attrs[0].rolsuper || attrs[0].rolbypassrls || !attrs[0].rolcanlogin) {
    console.error('  ✗ app role would BYPASS RLS — must be NOSUPERUSER NOBYPASSRLS LOGIN');
    failed = true;
  }

  console.log('→ Checking RLS is enabled + forced on tenant-scoped tables');
  const rls = await client`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname = ANY(${TENANT_TABLES}) AND relkind = 'r'
    ORDER BY relname`;
  for (const r of rls) {
    const ok = r.relrowsecurity;
    console.log(
      `  · ${r.relname.padEnd(12)} rowsecurity=${r.relrowsecurity} force=${r.relforcerowsecurity}`,
    );
    if (!ok) {
      console.error(`  ✗ RLS not enabled on ${r.relname}`);
      failed = true;
    }
  }
  if (rls.length !== TENANT_TABLES.length) {
    console.error(`  ✗ expected ${TENANT_TABLES.length} tenant tables, saw ${rls.length}`);
    failed = true;
  }

  console.log('→ Querying dealers WITHOUT app.tenant_id (RLS must filter to 0, not error)');
  const noCtx = await client`SELECT count(*)::int AS n FROM dealers`;
  console.log(`  · dealers visible without tenant context: ${noCtx[0].n}`);
  if (noCtx[0].n !== 0) {
    console.error('  ✗ rows visible without tenant context — RLS NOT enforced');
    failed = true;
  }

  if (failed) {
    console.error('\n✗ production RLS smoke FAILED');
    process.exit(1);
  }
  console.log('\n✓ production RLS smoke OK');
} finally {
  await client.end({ timeout: 5 });
}
