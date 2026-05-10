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
    CREATE ROLE dealerlink_app LOGIN PASSWORD 'dev_app_password_change_me';
  END IF;
END $$;

-- Strip any inherited bypass capability defensively.
ALTER ROLE dealerlink_app NOSUPERUSER NOBYPASSRLS;

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
