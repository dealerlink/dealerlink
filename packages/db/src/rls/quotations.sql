ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON quotations;
CREATE POLICY tenant_isolation ON quotations
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON quotation_lines;
CREATE POLICY tenant_isolation ON quotation_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE quotation_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_status_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON quotation_status_history;
CREATE POLICY tenant_isolation ON quotation_status_history
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Self-FK for revision chain: enforce after the table exists.
ALTER TABLE quotations
  DROP CONSTRAINT IF EXISTS quotations_parent_quotation_id_fk;
ALTER TABLE quotations
  ADD CONSTRAINT quotations_parent_quotation_id_fk
  FOREIGN KEY (parent_quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;
