ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON deals;
CREATE POLICY tenant_isolation ON deals
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE deal_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_products FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON deal_products;
CREATE POLICY tenant_isolation ON deal_products
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_stage_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON deal_stage_history;
CREATE POLICY tenant_isolation ON deal_stage_history
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
