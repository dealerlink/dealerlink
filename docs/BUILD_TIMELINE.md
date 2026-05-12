# Implementation Order (Suggested 3.5-Week Plan)

> **Scope:** Day-by-day Stage B plan, 18 days from foundation to staging deploy. Back to [CLAUDE.md](../CLAUDE.md).

## Week 1 — Foundation

- Day 1: Repo setup, design tokens, font loading, `globals.css`, base layout (Sidebar + Topbar + Shell)
- Day 2: Drizzle schema for tenant, user, role + Lucia auth + login screen (Aurora theme)
- Day 3: RLS policies, tenant middleware, audit log triggers, seed scripts skeleton
- Day 4: Dealer Master CRUD (list + detail + create/edit) — first real module, sets the pattern
- Day 5: Product Catalog + Inventory schema and basic list views

## Week 2 — Core Operations

- Day 6: Inventory bulk procurement, serial entry, status transitions
- Day 7: Sales Pipeline — 9-stage kanban with dnd-kit
- Day 8: Quotation Builder UI + line items
- Day 9: GST calculation in `packages/tax/` + live preview integration
- Day 10: PDF rendering pipeline + Puppeteer worker setup

## Week 3 — Order Lifecycle

- Day 11: PI generation, Order creation from accepted quote
- Day 12: Payment tracking, status transitions
- Day 13: Dispatch flow — pick serials, generate LR, tax invoice
- Day 14: Email log, Resend integration (outbound + inbound webhooks)
- Day 15: Reports (Pipeline Health, Inventory Status, Payment Outstanding, GST Summary)

## Half Week 4 — Polish & Ship

- Day 16: Settings, user management, notifications
- Day 17: Observability wiring (Sentry, Better Stack, Axiom, /health)
- Day 18: E2E tests for primary workflows, deploy to staging

This is aggressive. Cut features, not quality, if behind schedule. **Inventory and GST are non-negotiable.** Reports can ship as MVP.
