-- ============================================================================
-- RLS HELPERS
-- ----------------------------------------------------------------------------
-- All tenant-scoped tables use a uniform policy that reads `app.tenant_id`
-- from the session/transaction GUC. The `true` second arg to current_setting
-- makes it return null instead of erroring when unset, so migrations and
-- maintenance scripts running without a tenant context do not blow up.
-- ============================================================================

-- A reusable predicate. Returns the current tenant UUID or null.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;
