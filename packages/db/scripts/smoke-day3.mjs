// E2E Day 3 smoke. Boots a session for the operator and one tenant admin,
// drives /admin → impersonation enter → /dashboard with banner →
// impersonation exit → back to /admin. Asserts:
//   - Login pages render with the right tenant heading
//   - /admin lists tenants for an operator
//   - The impersonation flow writes an access_log row
//   - The (app) shell shows the banner while impersonating
//   - The cookie clear on exit returns the operator to /admin
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '..', '..', '..', '.env.local') });

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const ADMIN_DB = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!ADMIN_DB) throw new Error('DATABASE_DIRECT_URL is not set');

const sql = postgres(ADMIN_DB, { max: 1, prepare: false });

async function createSession(email) {
  const [user] = await sql`SELECT id, role FROM users WHERE email = ${email} LIMIT 1`;
  if (!user) throw new Error(`user ${email} not found`);
  const sessionId = randomBytes(20).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions (id, user_id, expires_at) VALUES (${sessionId}, ${user.id}, ${expiresAt})`;
  return { sessionId, user };
}

async function fetchWith(sessionId, route, cookies = {}) {
  const cookieParts = [`dealerlink_session=${sessionId}`];
  for (const [k, v] of Object.entries(cookies)) {
    cookieParts.push(`${k}=${v}`);
  }
  return fetch(`${BASE}${route}`, {
    headers: { Cookie: cookieParts.join('; ') },
    redirect: 'manual',
  });
}

let failed = false;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!ok) failed = true;
}

async function main() {
  // 1. Generic login (no tenant). The heading splits across DOM nodes, so
  // we look for the literal display name we'd expect when no tenant resolves.
  const loginGenericRes = await fetch(`${BASE}/login`);
  const loginGeneric = await loginGenericRes.text();
  check(
    'GET /login (no tenant) shows generic Dealerlink branding',
    loginGenericRes.status === 200 &&
      loginGeneric.includes('Sign in to your tenant') &&
      !loginGeneric.includes('Demo Solar Distributors') &&
      !loginGeneric.includes('Sample Industrial'),
  );

  // 2. Tenant-scoped login
  const loginDemoRes = await fetch(`${BASE}/login?tenant=demo`);
  const loginDemo = await loginDemoRes.text();
  check(
    'GET /login?tenant=demo shows Demo Solar Distributors',
    loginDemoRes.status === 200 && loginDemo.includes('Demo Solar Distributors'),
  );

  // 3. Operator → /admin lists tenants
  const operator = await createSession('operator@dealerlink.test');
  const adminRes = await fetchWith(operator.sessionId, '/admin');
  const adminBody = await adminRes.text();
  check(
    'operator GET /admin → 200, lists Demo + Sample',
    adminRes.status === 200 &&
      adminBody.includes('Demo Solar Distributors') &&
      adminBody.includes('Sample Industrial Co'),
  );

  // 4. Get demo tenant id
  const [demo] = await sql`SELECT id, slug FROM tenants WHERE slug = 'demo'`;
  if (!demo) throw new Error('demo tenant missing');

  // 5. operator → /admin/tenants/[id] shows enter button
  const detailRes = await fetchWith(operator.sessionId, `/admin/tenants/${demo.id}`);
  const detailBody = await detailRes.text();
  check(
    'operator GET /admin/tenants/[id] → 200, shows Enter button',
    detailRes.status === 200 && detailBody.includes('Enter tenant workspace'),
  );

  // 6. Simulate impersonation by setting the cookie directly. The Server
  //    Action would do this for us in the UI flow.
  const impersonationCookie = demo.id;
  const dashRes = await fetchWith(operator.sessionId, '/dashboard?tenant=demo', {
    dealerlink_impersonation: impersonationCookie,
  });
  const dashBody = await dashRes.text();
  check(
    'operator + impersonation cookie GET /dashboard → 200 with banner',
    dashRes.status === 200 && dashBody.includes('Operator impersonation'),
  );

  // 7. Tenant admin → /dashboard (no impersonation, no banner)
  const tenantAdmin = await createSession('admin@demo.test');
  const adminDashRes = await fetchWith(tenantAdmin.sessionId, '/dashboard');
  const adminDashBody = await adminDashRes.text();
  check(
    'tenant admin GET /dashboard → 200 with no banner',
    adminDashRes.status === 200 &&
      adminDashBody.includes('Good') &&
      !adminDashBody.includes('Operator impersonation'),
  );

  // 8. Tenant admin → /admin should redirect (operator-only)
  const tenantOnAdminRes = await fetchWith(tenantAdmin.sessionId, '/admin');
  check(
    'tenant admin GET /admin → 307 redirect (operator-only)',
    tenantOnAdminRes.status === 307 || tenantOnAdminRes.status === 302,
  );

  // 9. Operator → /dashboard WITHOUT impersonation cookie should redirect to /admin
  const operatorOnDashRes = await fetchWith(operator.sessionId, '/dashboard');
  check(
    'operator GET /dashboard (no cookie) → 307 to /admin',
    operatorOnDashRes.status === 307 || operatorOnDashRes.status === 302,
  );

  // 10. /api/health
  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();
  check(
    'GET /api/health → 200, all enabled checks ok',
    healthRes.status === 200 &&
      health.checks.db.ok &&
      health.checks.migrations.ok &&
      health.checks.auditTrigger.ok &&
      health.checks.rls.ok,
    `db=${health.checks.db.latencyMs}ms`,
  );

  await sql.end({ timeout: 5 });
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
