-- E.1 pilot go-live validation — UMA TRADING COMPANY (slug: umatrading)
-- READ-ONLY. Run against production AFTER the operator creates the tenant.
--
-- How to run (operator):
--   psql "$DATABASE_DIRECT_URL" -f docs/pilot/E1_VALIDATION.sql
-- (DATABASE_DIRECT_URL = the doadmin connection string for dealerlink_production;
--  the production DB is firewalled to the app, so run from a host whose IP is
--  temporarily whitelisted, then remove the rule — see PRODUCTION_ENV.md.)
--
-- This connects as doadmin (bypasses RLS) ONLY to inspect the row that was just
-- created. It writes nothing. Expected results are noted on each query.

\echo '=== 1. Tenant record (expect: UMA TRADING COMPANY / umatrading / active) ==='
SELECT id, slug, legal_name, display_name, status, created_at
FROM tenants
WHERE slug = 'umatrading';

\echo '=== 2. Tenant settings (expect: gstin 27ADOPA1874B1ZT, state MH, pan ADOPA1874B) ==='
SELECT ts.gstin, ts.pan, ts.state, ts.address_state, ts.address_city,
       ts.address_pincode, ts.fiscal_year_start, ts.default_currency,
       ts.bank_name, ts.bank_branch
FROM tenant_settings ts
JOIN tenants t ON t.id = ts.tenant_id
WHERE t.slug = 'umatrading';
-- NOTE: bank_branch should read the PLACEHOLDER text — confirms the deliberate
-- placeholder bank is in place and must be replaced before invoicing.

\echo '=== 3. Admin user (expect: 1 row, email LOWERCASE, must_change_password = true, role admin) ==='
SELECT u.email,
       (u.email = lower(u.email))      AS email_is_lowercase,   -- expect t
       u.must_change_password,                                   -- expect t
       u.role,                                                   -- expect admin
       u.status,                                                 -- expect active
       u.full_name
FROM users u
JOIN tenants t ON t.id = u.tenant_id
WHERE t.slug = 'umatrading';

\echo '=== 4. Tenant is EMPTY (expect: every count = 0 — no demo/test pollution) ==='
SELECT
  (SELECT count(*) FROM dealers      d  WHERE d.tenant_id  = t.id) AS dealers,
  (SELECT count(*) FROM products     p  WHERE p.tenant_id  = t.id) AS products,
  (SELECT count(*) FROM quotations   q  WHERE q.tenant_id  = t.id) AS quotations,
  (SELECT count(*) FROM orders       o  WHERE o.tenant_id  = t.id) AS orders,
  (SELECT count(*) FROM payments     pm WHERE pm.tenant_id = t.id) AS payments,
  (SELECT count(*) FROM dispatches   ds WHERE ds.tenant_id = t.id) AS dispatches
FROM tenants t WHERE t.slug = 'umatrading';

\echo '=== 5. Welcome email queued/sent (expect: 1 row, template tenant-welcome) ==='
SELECT edl.status, edl.template, edl.recipient, edl.queued_at, edl.sent_at
FROM email_delivery_log edl
JOIN tenants t ON t.id = edl.tenant_id
WHERE t.slug = 'umatrading'
ORDER BY edl.queued_at DESC;
-- NOTE: status 'sent' = delivered to Resend; 'queued' = worker hasn't picked it
-- up yet (re-run shortly). The rendered body (with the temp password) is dropped
-- from meta once the send succeeds — never logged in plaintext after delivery.

\echo '=== 6. Audit trail exists for the provisioning (expect: >= 1 row) ==='
SELECT count(*) AS audit_rows
FROM audit_log al
JOIN tenants t ON t.id = al.tenant_id
WHERE t.slug = 'umatrading';

\echo '=== Validation complete. Confirm every expectation above, then go live. ==='
