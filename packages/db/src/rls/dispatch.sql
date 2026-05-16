ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatches;
CREATE POLICY tenant_isolation ON dispatches
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE dispatch_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatch_lines;
CREATE POLICY tenant_isolation ON dispatch_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE dispatch_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_serials FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dispatch_serials;
CREATE POLICY tenant_isolation ON dispatch_serials
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
