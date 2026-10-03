ALTER TABLE agent_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON agent_tokens;
CREATE POLICY tenant_isolation ON agent_tokens
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
