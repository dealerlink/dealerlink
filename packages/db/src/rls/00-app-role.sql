-- ============================================================================
-- APP ROLE
-- ----------------------------------------------------------------------------
-- The app connects as `dealerlink_app`, a NOLOGIN-NOBYPASSRLS role distinct
-- from the migrations/admin role. RLS only applies to non-superuser, non-
-- BYPASSRLS roles, so the application MUST use this role at runtime.
--
-- Migrations + seeds keep using the admin role (`dealerlink`) which has
-- SUPERUSER and bypasses RLS — convenient for trusted maintenance jobs.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dealerlink_app') THEN
    -- Password matches DATABASE_URL in .env.local; rotate before any non-dev use.
    -- NOSUPERUSER NOBYPASSRLS are PG defaults but we set them explicitly so
    -- the role is correct without a follow-up ALTER. Managed-Postgres admins
    -- (e.g. DO `doadmin`) cannot run ALTER ROLE ... NOSUPERUSER, so anything
    -- that needs ALTER to fix attrs fails on those environments.
    CREATE ROLE dealerlink_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'dev_app_password_change_me';
  END IF;
END $$;

-- Defensive repair for older dev databases where the role was created without
-- the desired attrs. Only runs when the attrs are wrong, and tolerates
-- managed environments where ALTER ROLE on attrs is forbidden — in that case
-- the role must already have been created with the correct attrs above.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'dealerlink_app' AND (rolsuper OR rolbypassrls)
  ) THEN
    BEGIN
      ALTER ROLE dealerlink_app NOSUPERUSER NOBYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE
        'Cannot ALTER dealerlink_app attrs (insufficient privilege); assuming role was created with correct attrs.';
    END;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO dealerlink_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dealerlink_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dealerlink_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO dealerlink_app;

-- New tables/sequences/functions added by future migrations inherit grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dealerlink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dealerlink_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO dealerlink_app;
