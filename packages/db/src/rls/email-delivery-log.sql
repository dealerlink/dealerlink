-- email_delivery_log: tenant-scoped reads. tenant_id is nullable for
-- platform-issued emails (e.g., the welcome email to a brand-new tenant's
-- admin user). Those rows are NOT visible to any tenant context — only
-- platform operators querying with app.tenant_id unset (and via adminDb /
-- raw queries) can see them.
ALTER TABLE email_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_delivery_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON email_delivery_log;
CREATE POLICY tenant_isolation ON email_delivery_log
  USING (
    CASE
      WHEN app_current_tenant() IS NULL THEN tenant_id IS NULL
      ELSE tenant_id = app_current_tenant()
    END
  );

-- Workers + operator actions write rows for both platform and tenant
-- emails. Permissive INSERT mirrors the pattern used by audit_log /
-- access_log writers.
DROP POLICY IF EXISTS email_delivery_insert ON email_delivery_log;
CREATE POLICY email_delivery_insert ON email_delivery_log
  FOR INSERT
  WITH CHECK (true);

-- The worker updates the row to mark sent/failed after the provider call.
DROP POLICY IF EXISTS email_delivery_update ON email_delivery_log;
CREATE POLICY email_delivery_update ON email_delivery_log
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
