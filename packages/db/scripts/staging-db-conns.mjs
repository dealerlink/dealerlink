import postgres from 'postgres';
const s = postgres(process.env.STAGING_ADMIN_TARGET_URL, { max: 1, prepare: false });
try {
  const mc = await s`SHOW max_connections`;
  const total = await s`SELECT count(*)::int AS n FROM pg_stat_activity`;
  const byUser = await s`
    SELECT usename, count(*)::int AS n
    FROM pg_stat_activity
    WHERE usename IS NOT NULL
    GROUP BY usename ORDER BY n DESC`;
  const byState = await s`
    SELECT usename, state, count(*)::int AS n
    FROM pg_stat_activity
    WHERE usename = 'dealerlink_app' OR usename = 'doadmin'
    GROUP BY usename, state ORDER BY n DESC`;
  console.log('max_connections :', mc[0].max_connections);
  console.log('total active    :', total[0].n);
  console.log('by user         :', JSON.stringify(byUser));
  console.log('app/doadmin state:', JSON.stringify(byState));
} finally {
  await s.end({ timeout: 5 });
}
