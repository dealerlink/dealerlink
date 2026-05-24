# Staging environment

> The Dealerlink staging deployment on DigitalOcean App Platform (Bangalore).
> Stood up in Stage C Day 1 (C.0). This is an internal-validation + pilot-preview
> environment — **not** production. Kept current through C.2 — see
> "Updates since stand-up" below.

## Updates since stand-up (Stage C C.1–C.2)

The deploy is GitOps (every push to `main` auto-deploys), so the following
shipped to staging after the C.0 stand-up:

- **C.1 — force-password-change.** The rotation trapdoor is live. Seeded users
  carry `must_change_password = false`, so the pilot credentials below still log
  straight in; only newly provisioned / reset users hit the rotation screen.
- **C.2 — state-code normalization (migration `0015_normalize_state_codes`).**
  Applied on staging — **16 migrations applied / 16 on disk**. Every state
  column (`tenant_settings.state`/`address_state`, `dealers.state`, and the
  `place_of_supply` / `tenant_state_at_issue` columns on quotations / PIs /
  orders) now holds a 2-letter ISO 3166-2:IN code (`MH`, `KA`, …), CHECK-enforced.
  UI dropdowns submit codes; screens, PDFs and reports render the full name. Tax
  classification (intra- vs inter-state) is unchanged — codes just guarantee a
  consistent format on both sides (DEV.70).
- **Three-party PIs reachable.** The seeded three-party Performa Invoices
  (Bill-To ≠ Ship-To, e.g. `PI-2026-0003`) are present and viewable on the
  staging `/pi` list — search the list by PI number to open one and see the
  distinct Bill-To / Ship-To party blocks (DEV.71).
- **Dealer / catalog detail pages fixed.** `/dealers/[id]` and `/catalog/[id]`
  previously fell to their error boundary on staging (a server→client
  function-prop serialization crash). Both detail pages now render correctly
  (DEV.72, closes DEV.56(d)).

## URLs

| Surface               | URL                                                 |
| --------------------- | --------------------------------------------------- |
| Apex (operator/login) | https://staging.dealerlink.in                       |
| Demo tenant           | https://demo.staging.dealerlink.in                  |
| Sample tenant         | https://sample.staging.dealerlink.in                |
| Health check          | https://staging.dealerlink.in/api/health            |
| DO-provided origin    | https://dealerlink-staging-34jng.ondigitalocean.app |

Tenant routing is by subdomain: `<slug>.staging.dealerlink.in` resolves to
tenant `<slug>`; the apex resolves to the operator/login surface. This is
driven by `NEXT_PUBLIC_APP_DOMAIN=staging.dealerlink.in` (see ADR/DEV.60).

New tenants need their subdomain added two places before they work on
staging:

1. A Cloudflare DNS CNAME (or rely on `*.staging` — it resolves, but DO needs
   the explicit domain for an HTTP-01 cert).
2. A custom domain entry in `.do/app.yaml` (`<slug>.staging.dealerlink.in`,
   type ALIAS), then `node scripts/staging-app-render-spec.mjs` +
   `doctl apps update <app-id> --spec .do/app.rendered.yaml`.

A true wildcard cert isn't possible while DNS lives on Cloudflare (DO needs
DNS-01 for wildcards). Stage D revisits this.

## Tenants & seeded users

Staging is seeded with the same fixture data as local dev (demo + sample
tenants). These are **test credentials**, safe to share with the pilot for a
guided walkthrough — they are not real accounts.

| Tenant | Subdomain                    | Roles (all password `password123`)                                                  |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------- |
| demo   | demo.staging.dealerlink.in   | admin@demo.test · sales@demo.test · accounts@demo.test · dispatch@demo.test         |
| sample | sample.staging.dealerlink.in | admin@sample.test · sales@sample.test · accounts@sample.test · dispatch@sample.test |

The operator (platform-admin) account is `operator@dealerlink.test` /
`password123`, reached at the apex.

> The pilot customer's **real** tenant is provisioned separately in Stage E —
> not seeded here.

## Infrastructure

| Resource      | Identifier                                                             |
| ------------- | ---------------------------------------------------------------------- |
| App           | `dealerlink-staging` (id `77edf06b-3273-479c-ae1c-15caca0db95b`)       |
| Web component | `web` — basic-xs (1 GB), `pnpm --filter web start`, port 3000          |
| Workers       | `workers` — basic-xxs (512 MB), `pnpm --filter workers start`          |
| Database      | `dealerlink-staging-db` (id `638761df-…`), PG 16, db-s-1vcpu-1gb, BLR1 |
| DB name       | `dealerlink_staging`                                                   |
| Region        | BLR1 (Bangalore)                                                       |
| Cost          | ~$30/month ($10 web + $5 workers + $15 DB)                             |

Deploy is GitOps: every push to `main` auto-deploys. The spec source of truth
is `.do/app.yaml`; secret values live outside the repo (see below).

## Secrets

Secret values are **not** in this repo. The local source of truth is
`C:\Users\rohit\.dealerlink\staging-secrets.txt` (gitignored, outside the
repo tree). The running app reads them from DO App Platform encrypted env
vars. To re-sync after editing the secrets file:

```
node scripts/staging-app-render-spec.mjs        # → .do/app.rendered.yaml (gitignored)
doctl apps update 77edf06b-3273-479c-ae1c-15caca0db95b --spec .do/app.rendered.yaml
```

Observability env (Sentry / Better Stack / Axiom) and the outbound Resend API
key are intentionally blank on staging — those surfaces degrade gracefully to
no-ops (Day 17 contract). They are wired with real values in Stage D.

## Resetting the staging database

Staging data is disposable. To reset to a clean seeded state (drops the
named DB, recreates extensions, re-migrates, re-seeds) — all commands set
`DATABASE_DIRECT_URL` / `STAGING_*` env from the secrets file:

```
# 1. Recreate the named DB + extensions (idempotent)
STAGING_BOOTSTRAP_PHASE=pre  STAGING_DB_NAME=dealerlink_staging \
  STAGING_ADMIN_DEFAULTDB_URL=<doadmin@…/defaultdb> \
  STAGING_ADMIN_TARGET_URL=<doadmin@…/dealerlink_staging> \
  node packages/db/scripts/staging-db-bootstrap.mjs

# 2. Migrate + rotate app-role password + seed
DATABASE_DIRECT_URL=<doadmin@…/dealerlink_staging> pnpm --filter @dealerlink/db db:migrate
STAGING_BOOTSTRAP_PHASE=finalize STAGING_DB_NAME=dealerlink_staging \
  STAGING_ADMIN_TARGET_URL=<doadmin@…/dealerlink_staging> \
  STAGING_APP_PASSWORD=<app-pw> node packages/db/scripts/staging-db-bootstrap.mjs
DATABASE_DIRECT_URL=<doadmin@…/dealerlink_staging> pnpm --filter @dealerlink/db db:seed

# 3. Confirm RLS is enforced for the app role
STAGING_APP_URL=<dealerlink_app@…/dealerlink_staging> node packages/db/scripts/staging-db-smoke.mjs
```

To wipe just the data without re-provisioning, re-running the seed (it
truncates + reseeds) is enough.

## Smoke test against staging

The full critical-path E2E can be driven against the deployed app (it creates
its own uniquely-suffixed entities, so it's safe to re-run):

```
PLAYWRIGHT_BASE_URL=https://demo.staging.dealerlink.in \
  pnpm --filter web exec playwright test critical-path.spec.ts
```

The Playwright config skips its local dev server automatically when
`PLAYWRIGHT_BASE_URL` is an https host.

## Access

Single operator for now: rohit.gera19@gmail.com (DO account
`dealerlink.io@gmail.com`, Cloudflare zone owner). The pilot gets the demo
tenant URL + seeded credentials for a guided preview; no DO/Cloudflare access.

## Known limitations (Stage C Day 1)

- Outbound email is a no-op (no Resend key) — quotation/PI "send" enqueues
  but the worker skips the actual send. Inbound webhook + PDF generation work.
- No wildcard SSL — tenant subdomains are enumerated explicitly.
- Observability dashboards (Sentry/Better Stack/Axiom) not yet wired.
- `version` in `/api/health` reports `dev` (no git SHA injected at build).
