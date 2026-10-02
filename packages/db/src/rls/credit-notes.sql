-- F.6 / F.8 / F.144 — tenant isolation for credit_notes.
--
-- Follows rls/dealer-addresses.sql and rls/performa-invoices.sql exactly, and the
-- reasoning in those files applies unchanged:
--
--   FORCE matters as much as ENABLE — without it the table owner bypasses the
--   policy, and both the migrations and the seed run as owner.
--
--   WITH CHECK matters as much as USING — USING alone would let a tenant WRITE a
--   row belonging to another tenant while being unable to read it back, which is
--   worse than a read leak because nothing surfaces it.
--
-- Applied by migrate.ts on every run, which re-applies rls/*.sql after the drizzle
-- migrations, so DROP POLICY IF EXISTS keeps it idempotent. Dropping a new file in
-- is auto-discovered; nothing needs to register it.
--
-- This half IS checked automatically: packages/db/tests/rls.test.ts derives its
-- population from pg_class, so a tenant-scoped table without ENABLE, FORCE and a
-- tenant_isolation policy fails without anyone adding it to a list. The AUDIT half
-- is not — see triggers/audit-log.sql.
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON credit_notes;
CREATE POLICY tenant_isolation ON credit_notes
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
