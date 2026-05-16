ALTER TABLE performa_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE performa_invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON performa_invoices;
CREATE POLICY tenant_isolation ON performa_invoices
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE performa_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE performa_invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON performa_invoice_lines;
CREATE POLICY tenant_isolation ON performa_invoice_lines
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

ALTER TABLE performa_invoice_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE performa_invoice_status_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON performa_invoice_status_history;
CREATE POLICY tenant_isolation ON performa_invoice_status_history
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
