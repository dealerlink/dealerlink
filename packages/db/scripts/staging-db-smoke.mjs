/**
 * Staging DB smoke — verifies that connecting as the NOLOGIN-NOBYPASSRLS app
 * role enforces RLS. Run after staging-db-bootstrap.mjs `finalize`.
 *
 * Required env:
 *   STAGING_APP_URL     dealerlink_app URI to dealerlink_staging
 */
import postgres from 'postgres';

const url = process.env.STAGING_APP_URL;
if (!url) {
  console.error('STAGING_APP_URL is required');
  process.exit(2);
}

const client = postgres(url, { max: 1, prepare: false });
try {
  console.log('→ Connecting as dealerlink_app');
  const me = await client`SELECT current_user, current_database()`;
  console.log(`  · current_user=${me[0].current_user} db=${me[0].current_database}`);
  if (me[0].current_user !== 'dealerlink_app') {
    console.error('  ✗ unexpected user');
    process.exit(1);
  }

  console.log('→ Listing tenants WITHOUT setting app.tenant_id (RLS should hide all rows)');
  const noTenant = await client`SELECT count(*)::int AS n FROM tenants`;
  // tenants table is exempt from per-tenant RLS in the schema (it's the catalog itself),
  // so we test on a tenant-scoped table instead.
  const noTenantDealers = await client`SELECT count(*)::int AS n FROM dealers`;
  console.log(`  · tenants visible (catalog): ${noTenant[0].n}`);
  console.log(`  · dealers visible (no tenant context): ${noTenantDealers[0].n}`);
  if (noTenantDealers[0].n !== 0) {
    console.error('  ✗ dealers visible without tenant context — RLS NOT enforced');
    process.exit(1);
  }

  console.log('→ Setting app.tenant_id and re-querying');
  const tenant =
    await client`SELECT id, slug FROM tenants WHERE slug = 'demo' LIMIT 1`;
  if (tenant.length === 0) {
    console.error('  ✗ demo tenant missing — seed did not run');
    process.exit(1);
  }
  await client.begin(async (sql) => {
    await sql`SELECT set_config('app.tenant_id', ${tenant[0].id}, true)`;
    const withTenant = await sql`SELECT count(*)::int AS n FROM dealers`;
    console.log(`  · dealers visible for demo tenant: ${withTenant[0].n}`);
    if (withTenant[0].n === 0) {
      console.error('  ✗ expected seeded dealers');
      process.exit(1);
    }
  });

  console.log('✓ staging RLS smoke OK');
} finally {
  await client.end({ timeout: 5 });
}
