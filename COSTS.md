# COSTS.md — Dealerlink Operational Cost Model

> **Purpose:** Reference for what Dealerlink costs to run, where costs can spike, and what to do about it. Update as tiers change or new services are added.
>
> **Companion files:**
> - `CLAUDE.md` — implementation guide
> - `DECISIONS.md` — architecture decisions affecting cost
> - `PROJECT_PLAN.md` — production infrastructure tasks (Stage D)

---

## TL;DR

| Stage | Tenants | Monthly cost | Risk band |
|---|---|---|---|
| **Pilot baseline** | 1 (smoke test) | **~$40** | None |
| **Early growth** | 2–3 | **~$120** | Low |
| **One heavy tenant** | 1 large + 2 small | **~$160** | Medium |
| **Pre-scale trigger** | 5+ tenants | **~$250–350** | Time to consider DOKS migration |

The architecture is **financially well-behaved**. Every line is a fixed-tier subscription; no service has unbounded usage-based pricing that could surprise you.

---

## Pilot Baseline (Month 1–6)

Realistic Phase 1 volumes per BRD: ~500 inventory items, 30 deals, 50 emails, 10 dispatches/month per tenant. All costs in USD.

| Service | Plan | Monthly | Notes |
|---|---|---|---|
| **DigitalOcean App Platform** (Basic) | 1 GB RAM, 1 vCPU, BLR | $12 | Hosts the Next.js web app (Process 1) |
| **DigitalOcean Droplet** (workers) | 1 GB RAM, 1 vCPU, BLR | $6 | Puppeteer + pg-boss runner; alternative: same App Platform |
| **DO Managed Postgres** (Basic) | 1 GB RAM, 10 GB disk, BLR | $15 | Includes daily backups + 7-day point-in-time recovery |
| **DO Spaces** | 250 GB storage + 1 TB egress | $5 | Invoices, attachments, logos |
| **Resend** | Free tier (3K emails/mo) | $0 | Sufficient for Phase 1 |
| **Sentry** | Developer (free) | $0 | 5K errors/mo, 1 user |
| **Better Stack** | Free tier | $0 | 10 monitors, sufficient for uptime + status page |
| **DO Monitoring** | Built-in | $0 | CPU/RAM/disk/bandwidth alerts |
| **Axiom** | Free tier (~30 GB/mo) | $0 | Structured app logs |
| **GitHub Actions** | Free tier | $0 | 2K minutes/mo on private repos |
| **Domain + SSL** | Namecheap/Cloudflare + Let's Encrypt | $1 | ~$12/year amortized |
| **Total** | | **~$39/month** | |

---

## Realistic Ceiling (Month 6–12, 2–3 tenants onboarded)

| Service | Plan | Monthly | Why it goes up |
|---|---|---|---|
| **DO App Platform** (Pro) | 2 GB / 1 vCPU | $25 | Multi-tenant load |
| **DO Droplet** (workers) | 2 GB / 1 vCPU | $12 | Puppeteer needs more headroom |
| **DO Managed Postgres** | 2 GB / 25 GB | $30 | More tenants = more rows, RLS overhead |
| **DO Spaces** | Same | $5 | |
| **Resend** | Pro (50K emails) | $20 | If you cross 3K/mo |
| **Sentry** | Team | $26 | Multi-user, more errors |
| **GitHub Actions** | Free tier | $0 | Still under 2K min |
| **Total** | | **~$118/month** | |

---

## Cost Spike Risks

Where surprise bills can come from, ranked by likelihood × impact.

| Risk | Likelihood | Impact | Trigger | Mitigation |
|---|---|---|---|---|
| **Puppeteer memory spike → forced upgrade** | Medium | +$12–25/mo | Bulk PDF generation (100+ invoices in one batch for month-end). Chromium leaks ~50MB per render | Queue concurrency limit in pg-boss (max 2 concurrent renders); restart worker every 100 jobs |
| **Postgres storage growth** | Medium | +$15–30/mo per tier jump | Audit log + email body storage. 10K logged emails ≈ 500MB | Move email bodies + attachments to Spaces; keep only metadata in Postgres |
| **DO Spaces egress overage** | Low | +$0.01/GB after 1 TB | Repeated PDF downloads, or serving PDFs without caching | CDN-cache PDFs (DO Spaces has CDN built in, free); use signed short-lived URLs |
| **Resend volume spike** | Low | $20 → $90+ | Tenant with 50K+ emails/mo | Pro plan covers 50K; Scale plan ($90) covers 100K. Monitor and tier accordingly |
| **Sentry error storm** | Low | Plan auto-throttles, no surprise bill | Bad deploy floods errors | Set spike protection in Sentry settings (free) |
| **Bandwidth on App Platform** | Very low | $0.02/GB after 100 GB | Serving large file downloads through the app instead of Spaces | Always serve files from Spaces, not from the app |

---

## The Two Realistic Spike Scenarios

### 1. Inventory volume explosion

A tenant procures 50,000 panels in a month (plausible for a large solar distributor). You'll have:
- 50K rows in `inventory_items`
- 50K audit log entries
- Search performance degradation on `pg_trgm` → forces upgrade to 4 GB Postgres tier

**Realistic ceiling: +$30/mo for a heavy tenant.**

If `pg_trgm` becomes the bottleneck, add Meilisearch:
- Self-hosted on a $6 Droplet, OR
- Meili Cloud at ~$30/mo

### 2. PDF generation bottleneck

Each Puppeteer render takes 2–5 seconds and ~150 MB peak RAM. If a tenant generates 200 invoices in a batch (month-end), the worker queue backs up and the 1 GB Droplet swaps. Options:
- Upgrade worker to 2 GB Droplet (+$6/mo)
- Run Puppeteer with `--single-process` flag and limit concurrency to 1

**Realistic ceiling: +$6/mo, plus a one-time engineering tweak.**

---

## What Has No Cost Spike Risk

These services scale linearly with the database or have hard caps:

- **Postgres-as-queue (pg-boss)** — scales linearly with the database; no separate billing surface
- **Lucia auth** — sessions in Postgres, zero per-user cost ever
- **Tremor / shadcn / Tailwind** — all open source, no SaaS tier
- **Server Actions / tRPC** — zero per-request cost; you're paying for compute, not invocations
- **Better Stack** — free tier covers you well past 5 tenants
- **Axiom** — free tier (~30 GB/mo) covers structured logs at this scale

---

## Mandatory Cost Protection — Day One

Set DigitalOcean billing alerts on these thresholds. Five minutes of setup, total protection from runaway costs.

| Threshold | Action |
|---|---|
| **$50/month** | Email alert (sanity check that you haven't misconfigured something) |
| **$100/month** | Email alert (you're scaling — review what's growing) |
| **$200/month** | Email + SMS alert (something unexpected is happening) |

Also enable:
- **Sentry spike protection** (Settings → Quotas → On-Demand Budgets) — caps at your monthly limit
- **Resend usage cap** in account settings if available
- **DO Spaces egress alarm** in DO Monitoring at 800 GB (80% of free tier)

---

## Phase 2 Cost Considerations

When triggers below are met, expect these additions:

| Trigger | Service to add | Monthly cost |
|---|---|---|
| Job volume > 1K/day OR shared session store needed | Redis (DO Managed) | +$15 |
| `pg_trgm` slows on 100K+ records | Meilisearch (self-hosted on $6 Droplet) | +$6 |
| Multi-tenant data justifies session replay | PostHog Cloud | +$0 (free tier 1M events) → $250/mo for 5+ tenants |
| Tenant count crosses 5+ OR per-tenant scaling matters | DOKS (Kubernetes) | +$60–120 (3-node cluster) |
| Enterprise tenants land | SSO infra (Lucia + provider configs) | $0 (Lucia covers it) |

**Phase 2 ceiling estimate (5+ tenants on Kubernetes):** ~$400–500/month.

---

## Cost Per Tenant — Rule of Thumb

At realistic Phase 1 volumes:

| Tenants | Total cost | Per-tenant cost |
|---|---|---|
| 1 | $40 | $40 |
| 3 | $120 | $40 |
| 5 | $250 | $50 |
| 10 (Phase 2 scale) | $500 | $50 |

Dealerlink is cheap to operate at low tenant counts and stays roughly flat per tenant as you scale, with a small step-up around the Kubernetes migration. Pricing your SaaS at $50–100/tenant/month gives you a healthy margin from tenant #2 onward.

---

## Reviewing This File

Update this file when:
- A service tier changes
- A new service is added or removed
- A real-world cost spike occurs (capture in a "Spike Log" appendix below)
- Phase 2 triggers fire and you upgrade

---

## Spike Log

Append entries here when a real-world cost spike happens. Format: date, what happened, action taken, new monthly baseline.

| Date | Event | Action | New baseline |
|---|---|---|---|
| | | | |

---

*Last updated: May 2026 · Phase 1 baseline*
