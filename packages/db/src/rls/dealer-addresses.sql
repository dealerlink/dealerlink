-- F.5a — tenant isolation for dealer_addresses.
--
-- Follows rls/dealers.sql exactly. FORCE matters as much as ENABLE: without it
-- the table owner bypasses the policy, and both the migrations and the seed run
-- as owner. WITH CHECK matters as much as USING: USING alone would let a tenant
-- WRITE a row belonging to another tenant while being unable to read it back,
-- which is a worse failure than a read leak because nothing surfaces it.
--
-- This file is applied by migrate.ts on every run (it re-applies rls/*.sql after
-- the drizzle migrations), so DROP POLICY IF EXISTS keeps it idempotent.
--
-- `packages/db/tests/dealer-addresses.test.ts` was written BEFORE this file and
-- run against the migration without it. It failed on ENABLE, FORCE, the policy's
-- existence, cross-tenant reads AND cross-tenant writes — sample could both see
-- and insert into demo's rows. That red run is the evidence this policy is real.
ALTER TABLE dealer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_addresses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON dealer_addresses;
CREATE POLICY tenant_isolation ON dealer_addresses
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
