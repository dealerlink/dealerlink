/**
 * One-off post-migration verification for 0016 (F-3 columns).
 * Reads DATABASE_DIRECT_URL from env, runs the three M1.4-M1.6 queries,
 * prints results, exits non-zero on any failure.
 *
 * Delete after Stage D D.2 closeout — this is not a permanent script.
 */
import postgres from 'postgres';

const url = process.env.DATABASE_DIRECT_URL;
if (!url) {
  console.error('DATABASE_DIRECT_URL not set');
  process.exit(2);
}

const sql = postgres(url, { max: 1, prepare: false });
let failed = false;

try {
  console.log('=== M1.4 — failed_login_attempts + lockout_until exist on users ===');
  const colRows = await sql`
    SELECT failed_login_attempts, lockout_until
    FROM users
    LIMIT 1
  `;
  console.log(`rows returned: ${colRows.length}`);
  if (colRows.length > 0) {
    console.log(`  first row: failed_login_attempts=${colRows[0].failed_login_attempts}, lockout_until=${colRows[0].lockout_until ?? 'NULL'}`);
  }
  console.log('  OK — columns are present (no column-error)\n');
} catch (err) {
  failed = true;
  console.error('  FAIL — column query errored:', err.message, '\n');
}

try {
  console.log('=== M1.5 — RLS still enforced on users ===');
  const rlsRows = await sql`
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname = 'users'
  `;
  for (const r of rlsRows) {
    console.log(`  ${r.relname}: relrowsecurity=${r.relrowsecurity}, relforcerowsecurity=${r.relforcerowsecurity}`);
    if (!r.relrowsecurity || !r.relforcerowsecurity) {
      failed = true;
      console.error('  FAIL — RLS expected ENABLED + FORCED');
    }
  }
  if (!failed) console.log('  OK — RLS enforced\n');
  else console.log('');
} catch (err) {
  failed = true;
  console.error('  FAIL — RLS query errored:', err.message, '\n');
}

try {
  console.log('=== M1.6 — latest drizzle migration ===');
  const migRows = await sql`
    SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 3
  `;
  for (const r of migRows) {
    console.log(`  id=${r.id}, hash=${String(r.hash).slice(0, 16)}..., created_at=${r.created_at}`);
  }
  if (migRows.length === 0) {
    failed = true;
    console.error('  FAIL — no migrations recorded');
  } else {
    console.log('  OK — latest migration shown above\n');
  }
} catch (err) {
  // The schema for drizzle migrations may live under `drizzle` or `public`.
  // Fall back to public.
  try {
    const migRows = await sql`
      SELECT id, hash, created_at
      FROM "__drizzle_migrations"
      ORDER BY created_at DESC
      LIMIT 3
    `;
    for (const r of migRows) {
      console.log(`  id=${r.id}, hash=${String(r.hash).slice(0, 16)}..., created_at=${r.created_at}`);
    }
    console.log('  OK — latest migration shown above (public schema)\n');
  } catch (err2) {
    failed = true;
    console.error('  FAIL — migrations table query errored:', err2.message, '\n');
  }
}

await sql.end({ timeout: 5 });
process.exit(failed ? 1 : 0);
