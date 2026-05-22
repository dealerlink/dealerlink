import postgres from 'postgres';
const s = postgres(process.env.STAGING_ADMIN_TARGET_URL, { max: 1, prepare: false });
try {
  const mc = await s`SHOW max_connections`;
  const su = await s`SHOW superuser_reserved_connections`;
  const cur = await s`
    SELECT usename, count(*)::int AS n
    FROM pg_stat_activity
    WHERE usename IS NOT NULL
    GROUP BY usename ORDER BY n DESC`;
  console.log('max_connections        :', mc[0].max_connections);
  console.log('reserved_for_superuser :', su[0].superuser_reserved_connections);
  console.log('current by user        :', JSON.stringify(cur));
} finally {
  await s.end({ timeout: 5 });
}
