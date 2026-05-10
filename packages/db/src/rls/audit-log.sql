-- audit_log is written ONLY by the audit_log_writer() trigger (per CLAUDE.md
-- §6: "application code does not write directly"). RLS isolates reads to the
-- current tenant. We omit WITH CHECK because the trigger may need to write
-- audit rows whose tenant_id differs from app.tenant_id during cross-tenant
-- maintenance work.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON audit_log;
CREATE POLICY tenant_isolation ON audit_log
  USING (tenant_id = app_current_tenant());

-- Trigger writes go through a permissive insert policy.
DROP POLICY IF EXISTS audit_log_insert ON audit_log;
CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT
  WITH CHECK (true);
