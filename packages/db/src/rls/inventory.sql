ALTER TABLE procurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON procurements;
CREATE POLICY tenant_isolation ON procurements
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON procurement_items;
CREATE POLICY tenant_isolation ON procurement_items
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inventory_items;
CREATE POLICY tenant_isolation ON inventory_items
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
