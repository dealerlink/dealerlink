// E2E smoke: for each seeded user, create a Lucia session row directly in
// Postgres, send the cookie to the dev server, and confirm /dashboard
// renders without 5xx. Also temporarily nulls a user's full_name and
// confirms the page still renders (no crash from defensive fallback).
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts/ → packages/db/ → packages/ → repo root
loadEnv({ path: path.resolve(here, '..', '..', '..', '.env.local') });

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:3000';
const ADMIN_DB = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!ADMIN_DB) throw new Error('DATABASE_DIRECT_URL is not set');

const sql = postgres(ADMIN_DB, { max: 1, prepare: false });

async function createSessionFor(email) {
  const [user] = await sql`SELECT id, full_name FROM users WHERE email = ${email} LIMIT 1`;
  if (!user) throw new Error(`user ${email} not found`);
  const sessionId = randomBytes(20).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${sessionId}, ${user.id}, ${expiresAt})
  `;
  return { sessionId, user };
}

async function checkRoute(sessionId, route, expectedSubstring) {
  const res = await fetch(`${BASE}${route}`, {
    headers: { Cookie: `dealerlink_session=${sessionId}` },
    redirect: 'manual',
  });
  const body = await res.text();
  const ok =
    res.status === 200 && (!expectedSubstring || body.includes(expectedSubstring));
  return { status: res.status, ok, body: body.slice(0, 200) };
}

async function main() {
  const users = [
    { email: 'admin@demo.test', route: '/dashboard', expects: 'Good' },
    { email: 'sales@demo.test', route: '/dashboard', expects: 'Good' },
    { email: 'accounts@demo.test', route: '/dashboard', expects: 'Good' },
    { email: 'dispatch@demo.test', route: '/dashboard', expects: 'Good' },
    { email: 'admin@sample.test', route: '/dashboard', expects: 'Good' },
    { email: 'operator@dealerlink.test', route: '/admin', expects: 'Operator console' },
  ];

  let failed = false;
  for (const u of users) {
    const { sessionId } = await createSessionFor(u.email);
    const r = await checkRoute(sessionId, u.route, u.expects);
    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`${tag}  ${u.email.padEnd(28)}  ${u.route}  → ${r.status}`);
    if (!r.ok) {
      failed = true;
      console.log('  body[0..200]:', r.body);
    }
  }

  // Defensive-fallback test: null out a user's full_name and try again.
  console.log('\n→ Defensive fallback: nulling sales@demo.test full_name');
  const [{ id: salesId, full_name: original }] = await sql`
    SELECT id, full_name FROM users WHERE email = 'sales@demo.test' LIMIT 1
  `;
  await sql`UPDATE users SET full_name = '' WHERE id = ${salesId}`;
  try {
    const { sessionId } = await createSessionFor('sales@demo.test');
    const r = await checkRoute(sessionId, '/dashboard');
    const tag = r.ok ? 'PASS' : 'FAIL';
    console.log(`${tag}  sales@demo.test with EMPTY full_name → ${r.status}`);
    if (!r.ok) {
      failed = true;
      console.log('  body[0..200]:', r.body);
    }
  } finally {
    await sql`UPDATE users SET full_name = ${original} WHERE id = ${salesId}`;
  }

  await sql.end({ timeout: 5 });
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
