ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dealers;
CREATE POLICY tenant_isolation ON dealers
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
