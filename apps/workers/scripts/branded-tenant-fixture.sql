-- F.38 Day 25 follow-up — branded-tenant fixture.
--
-- Neither seeded tenant has a logo_url, so every reference captured on Day 25
-- exercised the UNBRANDED header path. Branding is where visual regressions
-- actually live (the logo band, the bank block, the footer), so the Day 26
-- sign-off gate needs a branded reference to diff against.
--
-- Sets a deterministic inline SVG logo on the `demo` tenant. Inline data URI
-- rather than a Spaces URL on purpose: it needs no network at render time, it
-- is byte-stable, and R.15 records that the base64 logo fallback is the Phase 1
-- path until DO Spaces ships. Accepted formats per CLAUDE.md §8 include SVG,
-- and 400x120 is the recommended header dimension.
--
-- Idempotent and throwaway: `pnpm db:seed` truncates and restores the seeded
-- state. Bank details are already seeded on both tenants and are NOT modified.
--
-- Run as the OWNER role (bypasses RLS):
--   psql "$DATABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f apps/workers/scripts/branded-tenant-fixture.sql

\set ON_ERROR_STOP on
BEGIN;

UPDATE tenant_settings ts
SET logo_url = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iMTIwIiB2aWV3Qm94PSIwIDAgNDAwIDEyMCI+PHJlY3Qgd2lkdGg9IjQwMCIgaGVpZ2h0PSIxMjAiIHJ4PSIxMiIgZmlsbD0iIzBGMTcyQSIvPjxjaXJjbGUgY3g9IjYyIiBjeT0iNjAiIHI9IjMwIiBmaWxsPSIjRjU5RTBCIi8+PHRleHQgeD0iMTEwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkhlbHZldGljYSxBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjMwIiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjRkZGRkZGIj5ERU1PIFNPTEFSPC90ZXh0Pjx0ZXh0IHg9IjExMCIgeT0iODgiIGZvbnQtZmFtaWx5PSJIZWx2ZXRpY2EsQXJpYWwsc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iI0E3RDhBNyI+RGlzdHJpYnV0b3JzIFB2dCBMdGQ8L3RleHQ+PC9zdmc+'
WHERE ts.tenant_id = (SELECT id FROM tenants WHERE slug = 'demo');

COMMIT;

SELECT t.slug,
       CASE WHEN ts.logo_url IS NULL THEN 'no-logo' ELSE 'logo' END AS brand,
       coalesce(length(ts.logo_url), 0) AS logo_chars,
       CASE WHEN ts.bank_account_number IS NULL THEN 'no-bank' ELSE 'bank' END AS bank
FROM tenants t JOIN tenant_settings ts ON ts.tenant_id = t.id ORDER BY t.slug;
