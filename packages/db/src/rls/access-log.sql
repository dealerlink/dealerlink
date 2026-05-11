-- Tenant-scoped reads. Writes are permitted from any context so that the
-- impersonation flow (which uses operator scope without a tenant_id GUC)
-- can record observation events scoped to the impersonated tenant.
ALTER TABLE access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON access_log;
CREATE POLICY tenant_isolation ON access_log
  USING (tenant_id = app_current_tenant());

DROP POLICY IF EXISTS access_log_insert ON access_log;
CREATE POLICY access_log_insert ON access_log
  FOR INSERT
  WITH CHECK (true);
