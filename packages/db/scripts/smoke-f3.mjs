/**
 * One-off F-3 smoke test (DEV.79 push verification, D.2). Exercises the
 * write/read shape of `users.failed_login_attempts` + `users.lockout_until`
 * against a target DB. Uses DATABASE_DIRECT_URL (doadmin) so it can both
 * INSERT a synthetic user and CLEAN it up — never touches a real seeded
 * user, never invokes the login Server Action (the decision logic that
 * drives these states is unit-tested in apps/web/lib/auth/lockout.test.ts).
 *
 * Delete after Stage D D.2 closeout.
 */
import postgres from 'postgres';

const url = process.env.DATABASE_DIRECT_URL;
if (!url) {
  console.error('DATABASE_DIRECT_URL not set');
  process.exit(2);
}

const TEST_EMAIL = 'noone-d2@dealerlink.test';
const sql = postgres(url, { max: 1, prepare: false });
let failed = false;

function check(label, cond, detail = '') {
  const tag = cond ? 'OK  ' : 'FAIL';
  if (!cond) failed = true;
  console.log(`  ${tag}  ${label}${detail ? '  →  ' + detail : ''}`);
}

try {
  // Up-front cleanup, in case a previous run left a row behind.
  await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`;

  console.log('=== A. Insert synthetic operator user (tenant_id NULL) ===');
  await sql`
    INSERT INTO users (
      email, password_hash, role, full_name, status,
      must_change_password, failed_login_attempts, lockout_until
    )
    VALUES (
      ${TEST_EMAIL},
      'argon2-placeholder-not-a-real-hash',
      'operator',
      'D.2 smoke test user (delete me)',
      'active',
      false,
      0, NULL
    )
  `;
  const [u0] = await sql`SELECT failed_login_attempts, lockout_until FROM users WHERE email = ${TEST_EMAIL}`;
  check('row inserted with default counter + null lock', u0.failed_login_attempts === 0 && u0.lockout_until === null,
    `attempts=${u0.failed_login_attempts}, lockout=${u0.lockout_until}`);

  console.log('');
  console.log('=== B. Walk counter sub-threshold (simulating 9 failed logins) ===');
  await sql`UPDATE users SET failed_login_attempts = 9 WHERE email = ${TEST_EMAIL}`;
  const [u9] = await sql`SELECT failed_login_attempts, lockout_until FROM users WHERE email = ${TEST_EMAIL}`;
  check('counter advances to 9, lock remains null', u9.failed_login_attempts === 9 && u9.lockout_until === null,
    `attempts=${u9.failed_login_attempts}, lockout=${u9.lockout_until}`);

  console.log('');
  console.log('=== C. Fire the lockout (10th failure: counter resets to 0, lock set 30 min out) ===');
  // This mirrors what nextFailureState(9, now) returns — the column UPDATE the
  // login() failure branch performs.
  const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
  await sql`
    UPDATE users
    SET failed_login_attempts = 0, lockout_until = ${lockUntil}
    WHERE email = ${TEST_EMAIL}
  `;
  const [uLocked] = await sql`SELECT failed_login_attempts, lockout_until FROM users WHERE email = ${TEST_EMAIL}`;
  check('counter back to 0 (lock-fire pattern)', uLocked.failed_login_attempts === 0,
    `attempts=${uLocked.failed_login_attempts}`);
  check('lockout_until in the future', uLocked.lockout_until && uLocked.lockout_until.getTime() > Date.now(),
    `lockout_until=${uLocked.lockout_until?.toISOString?.()}`);
  const minutesAhead = uLocked.lockout_until
    ? Math.round((uLocked.lockout_until.getTime() - Date.now()) / 60000)
    : NaN;
  check('lockout window ≈ 30 minutes ahead', minutesAhead >= 29 && minutesAhead <= 30, `${minutesAhead} min`);

  console.log('');
  console.log('=== D. Clear the lockout (R3c dev-path / success path on next login) ===');
  await sql`
    UPDATE users
    SET failed_login_attempts = 0, lockout_until = NULL
    WHERE email = ${TEST_EMAIL}
  `;
  const [uCleared] = await sql`SELECT failed_login_attempts, lockout_until FROM users WHERE email = ${TEST_EMAIL}`;
  check('both fields cleared', uCleared.failed_login_attempts === 0 && uCleared.lockout_until === null,
    `attempts=${uCleared.failed_login_attempts}, lockout=${uCleared.lockout_until}`);

  console.log('');
  console.log('=== E. Cleanup: remove the test user ===');
  const removed = await sql`DELETE FROM users WHERE email = ${TEST_EMAIL} RETURNING id`;
  check('test user removed', removed.length === 1, `deleted ${removed.length} row(s)`);
} catch (err) {
  failed = true;
  console.error('  FAIL — unexpected error:', err.message);
  // Best-effort cleanup so we never leave the synthetic row behind.
  try {
    await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
  } catch {
    /* ignore */
  }
}

await sql.end({ timeout: 5 });
console.log('');
console.log(failed ? 'F-3 smoke: FAILED' : 'F-3 smoke: OK');
process.exit(failed ? 1 : 0);
