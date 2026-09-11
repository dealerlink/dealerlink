-- F.38 Day 25 — long-serial-list dispatch fixtures.
--
-- The seeded data tops out at 8 serials on one dispatch, but the matrix's
-- highest-risk case is a serial list long enough to force page breaks: their
-- client's real invoice carries 26 under one line item, and 500 is the stress
-- case. This builds both, deterministically, against the `demo` tenant.
--
-- Idempotent: it deletes its own fixtures first, so re-running is safe.
-- Throwaway: `pnpm db:seed` truncates and removes these rows entirely, which is
-- how the dev database is returned to its seeded state after capture.
--
-- Run as the OWNER role (dealerlink), which bypasses RLS:
--   psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/workers/scripts/long-serial-fixture.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE ctx ON COMMIT DROP AS
WITH t AS (SELECT id FROM tenants WHERE slug = 'demo'),
     ol AS (
       SELECT ol.id AS order_line_id, ol.order_id, ol.product_id, p.sku, p.name AS pname
       FROM order_lines ol
       JOIN products p ON p.id = ol.product_id
       WHERE ol.tenant_id = (SELECT id FROM t)
       ORDER BY ol.order_id, ol.line_number
       LIMIT 1
     )
SELECT (SELECT id FROM t)                                                           AS tenant_id,
       ol.order_id, ol.order_line_id, ol.product_id, ol.sku, ol.pname,
       (SELECT d.id FROM dealers d WHERE d.tenant_id = (SELECT id FROM t) ORDER BY d.dealer_code LIMIT 1) AS dealer_id,
       (SELECT u.id FROM users u WHERE u.tenant_id = (SELECT id FROM t) ORDER BY u.email LIMIT 1)         AS user_id
FROM ol;

-- Remove any previous run of this fixture (serials first: FK to dispatch).
DELETE FROM dispatch_serials WHERE dispatch_id IN (SELECT id FROM dispatches WHERE dispatch_number LIKE 'DSP-REF-%');
DELETE FROM dispatch_lines   WHERE dispatch_id IN (SELECT id FROM dispatches WHERE dispatch_number LIKE 'DSP-REF-%');
DELETE FROM dispatches       WHERE dispatch_number LIKE 'DSP-REF-%';
DELETE FROM inventory_items  WHERE serial_number LIKE 'REF-SN-%';

-- Dedicated inventory so we never consume or mutate seeded stock.
INSERT INTO inventory_items (tenant_id, product_id, serial_number, status, warehouse_code, procurement_date, purchase_price, created_by, updated_by)
SELECT c.tenant_id, c.product_id, 'REF-SN-' || lpad(g::text, 5, '0'), 'in_stock', 'WH-REF', current_date, 1000.00, c.user_id, c.user_id
FROM ctx c, generate_series(1, 526) g;

-- Two dispatches: 26 serials (the real-world case) and 500 (the stress case).
INSERT INTO dispatches (tenant_id, dispatch_number, order_id, bill_to_dealer_id, ship_to_dealer_id, dispatch_date, status, vehicle_number, transporter_name, created_by, updated_by)
SELECT c.tenant_id, v.num, c.order_id, c.dealer_id, c.dealer_id, DATE '2026-04-01', 'in_transit', 'MH-12-AB-1234', 'Reference Transport Co', c.user_id, c.user_id
FROM ctx c, (VALUES ('DSP-REF-0026'), ('DSP-REF-0500')) AS v(num);

INSERT INTO dispatch_lines (tenant_id, dispatch_id, line_number, order_line_id, product_id, product_sku, product_name, quantity)
SELECT c.tenant_id, d.id, 1, c.order_line_id, c.product_id, c.sku, c.pname,
       CASE WHEN d.dispatch_number = 'DSP-REF-0026' THEN 26 ELSE 500 END
FROM ctx c JOIN dispatches d ON d.tenant_id = c.tenant_id AND d.dispatch_number LIKE 'DSP-REF-%';

-- 26 serials on the first dispatch, 500 on the second, from disjoint ranges.
INSERT INTO dispatch_serials (tenant_id, dispatch_id, dispatch_line_id, inventory_item_id)
SELECT c.tenant_id, d.id, dl.id, i.id
FROM ctx c
JOIN dispatches d     ON d.tenant_id = c.tenant_id AND d.dispatch_number = 'DSP-REF-0026'
JOIN dispatch_lines dl ON dl.dispatch_id = d.id
JOIN inventory_items i ON i.tenant_id = c.tenant_id
                      AND i.serial_number BETWEEN 'REF-SN-00001' AND 'REF-SN-00026';

INSERT INTO dispatch_serials (tenant_id, dispatch_id, dispatch_line_id, inventory_item_id)
SELECT c.tenant_id, d.id, dl.id, i.id
FROM ctx c
JOIN dispatches d     ON d.tenant_id = c.tenant_id AND d.dispatch_number = 'DSP-REF-0500'
JOIN dispatch_lines dl ON dl.dispatch_id = d.id
JOIN inventory_items i ON i.tenant_id = c.tenant_id
                      AND i.serial_number BETWEEN 'REF-SN-00027' AND 'REF-SN-00526';

UPDATE inventory_items i SET status = 'dispatched', dispatch_id = ds.dispatch_id, dispatched_at = now()
FROM dispatch_serials ds WHERE ds.inventory_item_id = i.id AND i.serial_number LIKE 'REF-SN-%';

COMMIT;

SELECT d.dispatch_number, (SELECT count(*) FROM dispatch_serials s WHERE s.dispatch_id = d.id) AS serials
FROM dispatches d WHERE d.dispatch_number LIKE 'DSP-REF-%' ORDER BY d.dispatch_number;
