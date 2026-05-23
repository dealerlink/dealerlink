# Project Structure

> **Scope:** Full monorepo layout — folder structure for `apps/`, `packages/`, and `scripts/`. Extracted from CLAUDE.md to keep the main guide slim. Back to [CLAUDE.md](../CLAUDE.md).

Use **pnpm workspaces** (no Turborepo until builds exceed 2 minutes).

```
dealerlink/
├── CLAUDE.md                       ← top-level guide
├── README.md
├── package.json                    ← workspace root
├── pnpm-workspace.yaml
├── .github/workflows/
│   ├── ci.yml                      ← lint + typecheck + test on PR
│   └── deploy.yml                  ← deploy on push to main
├── apps/
│   ├── web/                        ← Next.js app (Process 1)
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   ├── (app)/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── pipeline/
│   │   │   │   ├── dealers/
│   │   │   │   ├── catalog/
│   │   │   │   ├── inventory/
│   │   │   │   ├── quotations/
│   │   │   │   ├── orders/
│   │   │   │   ├── payments/
│   │   │   │   ├── dispatch/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   ├── api/
│   │   │   │   ├── trpc/[trpc]/
│   │   │   │   ├── health/         ← used by Better Stack
│   │   │   │   └── webhooks/
│   │   │   │       ├── resend-inbound/
│   │   │   │       └── resend-delivery/
│   │   │   └── globals.css         ← design tokens
│   │   ├── components/
│   │   │   ├── ui/                 ← shadcn primitives, restyled
│   │   │   ├── shell/              ← Sidebar, Topbar, Shell
│   │   │   ├── kpi/
│   │   │   ├── tables/
│   │   │   ├── charts/             ← custom SVG sparkline, funnel, aging
│   │   │   ├── forms/
│   │   │   └── pdf/                ← React components rendered to PDF
│   │   ├── lib/
│   │   │   ├── auth/               ← Lucia config + middleware
│   │   │   ├── trpc/
│   │   │   ├── actions/            ← Server Actions
│   │   │   ├── audit/              ← logging hooks
│   │   │   ├── format/             ← formatINR, formatGSTIN
│   │   │   └── tenant/             ← tenant context helpers
│   │   ├── server/
│   │   │   ├── routers/            ← tRPC routers
│   │   │   └── modules/            ← business logic per BRD module
│   │   └── tests/e2e/              ← Playwright: verify-day-N specs +
│   │                                 critical-path + operator-onboarding
│   └── workers/                    ← Puppeteer + pg-boss (Process 2)
│       ├── src/
│       │   ├── index.ts            ← pg-boss bootstrap
│       │   ├── jobs/
│       │   │   ├── render-pdf.ts
│       │   │   ├── send-email.ts
│       │   │   ├── parse-inbound.ts
│       │   │   └── nightly/
│       │   │       ├── low-stock-check.ts
│       │   │       ├── overdue-payments.ts
│       │   │       └── quote-expiry.ts
│       │   └── pdf/                ← Puppeteer launcher + templates
│       └── ecosystem.config.js     ← pm2 config
├── packages/
│   ├── db/                         ← Drizzle schema + migrations
│   │   ├── schema/
│   │   │   ├── tenant.ts
│   │   │   ├── user.ts
│   │   │   ├── dealer.ts
│   │   │   ├── product.ts
│   │   │   ├── inventory.ts
│   │   │   ├── deal.ts
│   │   │   ├── quotation.ts
│   │   │   ├── order.ts
│   │   │   ├── payment.ts
│   │   │   ├── dispatch.ts
│   │   │   ├── email.ts
│   │   │   └── logs/               ← all 6 log tables
│   │   │       ├── audit-log.ts
│   │   │       ├── auth-events.ts
│   │   │       ├── email-delivery.ts
│   │   │       ├── access-log.ts
│   │   │       └── document-log.ts
│   │   ├── migrations/
│   │   ├── seeds/                  ← per BRD §7
│   │   └── rls/                    ← RLS policy SQL
│   ├── schemas/                    ← Zod schemas, shared client + server
│   │                                 (incl. states.ts — canonical ISO 3166-2:IN
│   │                                  state codes + helpers; never hardcode a
│   │                                  state string. DEV.33 / DEV.70)
│   ├── tax/                        ← GST calculation (CGST/SGST/IGST)
│   └── design-tokens/              ← CSS vars + Tailwind config
└── scripts/
    ├── setup-db.sh
    ├── seed.ts
    └── deploy.sh
```
