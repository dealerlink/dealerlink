# COSTS.md — Dealerlink Operational Cost Model

> **Purpose:** Reference for what Dealerlink costs to run, where costs can spike, and what to do about it. Update as tiers change or new services are added.
>
> **Companion files:**
>
> - `CLAUDE.md` — implementation guide
> - `DECISIONS.md` — architecture decisions affecting cost
> - `PROJECT_PLAN.md` — production infrastructure tasks (Stage D)
>
> **Last updated:** June 2026 — reconciled against actual DO invoice (June 2–8, 2026). Previous estimates replaced with invoice-confirmed figures throughout.

---

## TL;DR

| Stage                 | Tenants           | Monthly cost (USD) | Monthly cost (INR, ~₹85/USD incl. forex) | Risk band                       |
| --------------------- | ----------------- | ------------------ | ---------------------------------------- | ------------------------------- |
| **Pilot baseline**    | 1 (live)          | **~$96**           | **~₹8,160**                              | None                            |
| **Early growth**      | 2–3               | **~$130–145**      | **~₹11,050–12,325**                      | Low                             |
| **One heavy tenant**  | 1 large + 2 small | **~$165**          | **~₹14,025**                             | Medium                          |
| **Pre-scale trigger** | 5+ tenants        | **~$270–370**      | **~₹22,950–31,450**                      | Time to consider DOKS migration |

> ⚠ **INR note:** DO bills in USD. Your card applies a forex conversion (~2% markup over RBI rate). At ₹83/USD spot + 2% = ~₹85/USD effective. All INR figures use ₹85/USD. The rate fluctuates — recheck quarterly.

> ⚠ **GST on DO bill:** DO collects 18% GST on your subscription as a registered foreign digital service provider in India. This is charged on top of the compute fees and appears as a separate tax line on every invoice. If Dealerlink becomes GST-registered, this may be claimable as Input Tax Credit (ITC) — confirm with your CA.

---

## Actual Pilot Baseline — Invoice-Confirmed (June 2026)

Reconciled against DO invoice preview for June 2–8, 2026 (8-day period, extrapolated to monthly).
All costs in USD unless stated.

### Production Environment (`dealerlink-production`)

| Service                 | Plan                      | Monthly (est.) | Invoice basis      | Notes                                        |
| ----------------------- | ------------------------- | -------------- | ------------------ | -------------------------------------------- |
| App Platform — web      | basic-xs · 1 GB RAM · BLR | ~$9.70         | $2.50 / 8 days     | Next.js web app                              |
| App Platform — workers  | basic-xs · 1 GB RAM · BLR | ~$9.70         | $2.50 / 8 days     | Puppeteer + pg-boss; Dockerfile (Chromium)   |
| DB — primary node       | Basic 2 GB / 1 vCPU · BLR | ~$23.25        | $6.00 / 8 days     | PG 16, ~50 connections, PITR backups         |
| DB — additional storage | 30 GiB (above base)       | ~$6.25         | $1.61 / 8 days     | Grows with data; monitor monthly             |
| DO Spaces               | 250 GB + 1 TB egress      | ~$5.00         | not yet on invoice | PDFs, attachments, logos — provision pending |
| **Production subtotal** |                           | **~$53.90**    |                    | Spaces not yet active                        |

### Staging Environment (`dealerlink-staging`, `first-project`)

| Service                 | Plan                      | Monthly (est.) | Invoice basis  | Notes                                                        |
| ----------------------- | ------------------------- | -------------- | -------------- | ------------------------------------------------------------ |
| App Platform — web      | basic-xs · 1 GB RAM · BLR | ~$9.70         | $2.50 / 8 days | ⚠ Same size as production — previously modelled as basic-xxs |
| App Platform — workers  | basic-xxs · 512 MB · BLR  | ~$4.85         | $1.25 / 8 days | Smaller OK — no OOM concern at demo volumes                  |
| DB — primary node       | Basic 1 GB / 1 vCPU · BLR | ~$12.60        | $3.25 / 8 days |                                                              |
| DB — additional storage | 10 GiB (above base)       | ~$2.10         | $0.54 / 8 days | Grows with dev/demo data                                     |
| **Staging subtotal**    |                           | **~$29.25**    |                |                                                              |

### Taxes

| Line                                | Monthly (est.) | Invoice basis  | Notes                                          |
| ----------------------------------- | -------------- | -------------- | ---------------------------------------------- |
| GST India 18% — IaaS (DB nodes)     | ~$6.47         | $1.67 / 8 days | Charged by DO on IaaS lines                    |
| GST India 18% — PaaS (App Platform) | ~$7.60         | $1.96 / 8 days | Charged by DO on PaaS lines                    |
| **GST subtotal**                    | **~$14.07**    |                | Potentially claimable as ITC if GST-registered |

### Domain

| Service      | Monthly (est.) | Notes                                                 |
| ------------ | -------------- | ----------------------------------------------------- |
| Domain + SSL | ~$1.00         | dealerlink.in, ~$12/yr amortised, Cloudflare DNS free |

---

### All-in Monthly Total (Invoice-Confirmed)

| Category                         | USD/mo       | INR/mo (₹85/USD) |
| -------------------------------- | ------------ | ---------------- |
| Production compute + DB + Spaces | ~$53.90      | ~₹4,582          |
| Staging compute + DB             | ~$29.25      | ~₹2,486          |
| GST on DO bill                   | ~$14.07      | ~₹1,196          |
| Domain                           | ~$1.00       | ~₹85             |
| Forex markup on card (~2%)       | ~$1.96       | ~₹167            |
| **True all-in total**            | **~$100.18** | **~₹8,516**      |

> **DO's own monthly prediction: ~$94** (excl. card forex markup). This is consistent with the 8-day extrapolation and confirms the model.

---

## What Changed vs Previous Estimates

| Item                  | Old estimate  | Actual (invoice)                     | Delta        | Reason                                           |
| --------------------- | ------------- | ------------------------------------ | ------------ | ------------------------------------------------ |
| Production DB         | $30 flat      | $23.25 node + $6.25 storage = $29.50 | ~−$0.50      | Composition different; storage will grow         |
| Staging web           | basic-xxs ~$5 | basic-xs ~$9.70                      | **+$4.70**   | Was not downgraded after staging was set up      |
| Staging DB storage    | $0            | ~$2.10                               | **+$2.10**   | 10 GiB extra storage not modelled                |
| Production DB storage | $0 (included) | ~$6.25                               | **+$6.25**   | 30 GiB extra storage billed separately           |
| GST on DO bill        | $0            | **~$14.07**                          | **+$14.07**  | DO collects Indian GST — not previously modelled |
| Card forex markup     | $0            | **~$1.96**                           | **+$1.96**   | ~2% on USD charge to Indian card                 |
| **Net delta**         | **~$85/mo**   | **~$100/mo**                         | **+~$15/mo** |                                                  |

---

## Cost Spike Risks

Where surprise bills can come from, ranked by likelihood × impact.

| Risk                                            | Likelihood | Impact | Mitigation                                                                                                                                            |
| ----------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB storage growth (audit logs, email bodies)    | High       | Medium | Move email bodies + attachments to Spaces; keep only metadata in DB. Monitor `pg_database_size()` monthly.                                            |
| Puppeteer OOM on bulk PDF runs                  | Medium     | Low    | Queue concurrency capped at 2 concurrent renders (ADR-013). Workers memory alert set at 80% in DO Monitoring.                                         |
| DO Spaces egress spike (repeated PDF downloads) | Low        | Low    | Enable CDN on Spaces bucket. Egress alert at 800 GB (80% of free 1 TB).                                                                               |
| Resend volume >3K/mo                            | Low        | Low    | Upgrade to Pro ($20/mo) when triggered. Per-tenant email caps recommended.                                                                            |
| DB storage crosses tier boundary                | Medium     | Medium | Basic 2 GB includes 25 GB storage. Additional storage at ~$0.21/GiB/mo. At current rate (~30 GiB in use after 1 month), budget ~$6/mo growing slowly. |
| Card forex rate worsening                       | Low        | Low    | Monitor quarterly. At ₹87/USD the all-in INR cost rises ~2.4%.                                                                                        |

### Billing Alerts (set in DO dashboard)

| Threshold      | Action                                                   |
| -------------- | -------------------------------------------------------- |
| **$50/month**  | Email alert — sanity check                               |
| **$100/month** | Email alert — at current baseline; review what's growing |
| **$150/month** | Email + SMS — something unexpected, investigate          |
| **$200/month** | Email + SMS — scaling event or misconfiguration          |

Also maintain:

- **Sentry spike protection** (Settings → Quotas → On-Demand Budgets)
- **Resend usage cap** in account settings
- **DO Spaces egress alarm** at 800 GB in DO Monitoring
- **DB connection count alert** at >40 (Pro-tier upgrade signal)
- **Workers memory alert** at >80% (PDF OOM signal, DEV.67)

---

## Realistic Ceiling (Month 6–12, 2–3 tenants onboarded)

Based on invoice-confirmed baseline + expected growth triggers.

| Service            | Plan                         | Monthly             | Why it goes up                           |
| ------------------ | ---------------------------- | ------------------- | ---------------------------------------- |
| Production web     | basic-xs (current)           | ~$9.70              | Stable unless sustained >80% memory      |
| Production workers | basic-xs (current)           | ~$9.70              | Stable; monitor memory on bulk PDF runs  |
| Production DB      | Basic 2 GB + growing storage | ~$32–38             | Storage grows ~5–10 GiB/month per tenant |
| Staging (all)      | Current                      | ~$29.25             | Stable                                   |
| DO Spaces          | 250 GB + 1 TB egress         | ~$5.00              | Once provisioned                         |
| Resend             | Pro (50K emails)             | ~$20.00             | When >3K emails/mo                       |
| Sentry             | Team                         | ~$26.00             | Multi-user, higher error budget          |
| GST on DO          | 18%                          | ~$20–22             | Grows with bill                          |
| Domain             | Same                         | ~$1.00              |                                          |
| **Total**          |                              | **~$152–161/month** | ~₹12,920–13,685                          |

---

## Phase 2 Cost Triggers

When the triggers below are met, expect these additions on top of the ceiling above:

| Trigger                                     | Service to add                        | Monthly cost (USD) |
| ------------------------------------------- | ------------------------------------- | ------------------ |
| Email volume > 3K/mo                        | Resend Pro (50K/mo)                   | +$20               |
| Scale-tier SLA commitment (30s monitoring)  | Better Stack paid                     | +$25–50            |
| Job volume > 1K/day OR shared session store | Redis (DO Managed)                    | +$15               |
| `pg_trgm` slow on 100K+ records             | Meilisearch (self-hosted $6 Droplet)  | +$6                |
| Bulk PDF batches > 100 invoices at once     | Workers Droplet upgrade to 2 GB       | +$6                |
| DB storage > 25 GB included (growing)       | Billed at ~$0.21/GiB/mo automatically | variable           |
| 5+ tenants OR per-tenant isolation needed   | DOKS Kubernetes (3-node cluster)      | +$60–120           |
| Product analytics + session replay          | PostHog Cloud (>1M events)            | +$250              |

**Phase 2 ceiling estimate (5+ tenants, all triggers, on Kubernetes):** ~$450–550/month (~₹38,250–46,750).

> **Kubernetes timing:** delay migration until 7–8 tenants (not 5) to avoid margin compression. At 5 tenants (₹42,500/mo revenue) Kubernetes at ~$100/mo is affordable but tight. At 8 tenants (₹68,000/mo) it's comfortable.

---

## Cost Per Tenant — Rule of Thumb (Updated)

Marginal cost per additional tenant is ~$5/month (incremental DB storage + Spaces growth). Fixed cost (~$96/mo all-in) is shared across all tenants.

| Tenants      | Total cost/mo (USD) | Total cost/mo (INR) | Per-tenant cost (USD) |
| ------------ | ------------------- | ------------------- | --------------------- |
| 1            | ~$100               | ~₹8,500             | ~$100                 |
| 2            | ~$105               | ~₹8,925             | ~$52.50               |
| 3            | ~$110               | ~₹9,350             | ~$36.70               |
| 5            | ~$120               | ~₹10,200            | ~$24                  |
| 10 (Phase 2) | ~$600 (Kubernetes)  | ~₹51,000            | ~$60                  |

At ₹8,500/month pricing (~$100/USD), you need **2 tenants to reach healthy margin (>50%)**. Tenant #1 at monthly plan is approximately break-even; tenant #1 at annual plan (₹7,083/mo effective) runs at a small loss until tenant #2 arrives.

---

## ITC Consideration (Action Required)

DO charges 18% GST on your subscription (~$14/month → ~₹1,190/month). Once Dealerlink is GST-registered and billing its own customers with GST:

- The GST paid to DO is potentially claimable as **Input Tax Credit (ITC)**
- This would reduce the effective infra cost by ~₹1,190/month (~$14/month)
- Net true cost if ITC claimed: ~$86/month → ~₹7,310/month

Confirm with your CA before relying on this in the P&L model.

---

## Reviewing This File

Update this file when:

- A DO invoice arrives and actuals differ from estimates
- A service tier changes (upgrade or downgrade)
- A new service is added or removed
- A real-world cost spike occurs (capture in Spike Log below)
- Phase 2 triggers fire and you upgrade
- Forex rate moves materially (>5% from ₹85/USD assumed here)

---

## Spike Log

| Date      | Event                                                                                                                                                                          | Action                                                                                          | New baseline       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------ |
| June 2026 | First DO invoice preview (8-day). Identified: GST on DO bill (~$14/mo) not previously modelled; staging web basic-xs (not basic-xxs as assumed); DB storage billed separately. | Updated COSTS.md with invoice-confirmed figures. Total revised from ~$85/mo to ~$100/mo all-in. | ~$100/mo (~₹8,500) |

---

_Last updated: June 2026 · Reconciled against DO invoice June 2–8, 2026_
