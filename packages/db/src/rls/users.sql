-- Users have a nullable tenant_id (operators are platform-level).
-- The policy: if app.tenant_id is set, only see rows for that tenant; if
-- unset, only see rows where tenant_id IS NULL (i.e., operators). This
-- keeps cross-tenant isolation strict while still allowing the operator
-- app to query its own users without setting a tenant context.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON users;
CREATE POLICY tenant_isolation ON users
  USING (
    CASE
      WHEN app_current_tenant() IS NULL THEN tenant_id IS NULL
      ELSE tenant_id = app_current_tenant()
    END
  )
  WITH CHECK (
    CASE
      WHEN app_current_tenant() IS NULL THEN tenant_id IS NULL
      ELSE tenant_id = app_current_tenant()
    END
  );
