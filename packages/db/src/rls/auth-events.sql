-- auth_events writes happen during login flows where the tenant context is
-- not yet set (e.g., a login attempt before we know which tenant the user
-- belongs to). Writes are trusted server-side; reads remain isolated.
ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON auth_events;
CREATE POLICY tenant_isolation ON auth_events
  USING (
    CASE
      WHEN app_current_tenant() IS NULL THEN tenant_id IS NULL
      ELSE tenant_id = app_current_tenant()
    END
  );

DROP POLICY IF EXISTS auth_events_insert ON auth_events;
CREATE POLICY auth_events_insert ON auth_events
  FOR INSERT
  WITH CHECK (true);
