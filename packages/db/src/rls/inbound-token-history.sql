ALTER TABLE inbound_token_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_token_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON inbound_token_history;
CREATE POLICY tenant_isolation ON inbound_token_history
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
