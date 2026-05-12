# Sample Data (BRD §7)

> **Scope:** Required seed volumes and the two demo tenants used for development + isolation testing. Back to [CLAUDE.md](../CLAUDE.md).

Seed scripts live in `packages/db/seeds/`. Required volumes:

- 2 tenants for development and isolation testing:
  - **`Demo Solar Distributors`** (primary seed tenant, based in Maharashtra) — exercises intra-state CGST+SGST tax paths
  - **`Sample Industrial Co`** (secondary seed tenant, based in Karnataka) — exercises a different vertical's custom fields and provides cross-tenant RLS isolation testing
- 8 users (4 per tenant): 1 Admin + 2 Sales + 1 Accounts + 1 Dispatch
- 3 manufacturers: Premier Energies, Adani Solar, Vikram Solar
- 20 product SKUs (real wattages 400W–650W, TOPCon/Bifacial/Mono, real HSN codes)
- 20 dealers across MH, AS, KA, TN, GJ, UP, RJ — varied Type/Category/Risk
- ~500 inventory items with serial numbers
- 30 deals across all 9 pipeline stages
- 15 quotations (Draft/Sent/Accepted)
- 20 orders with mixed payment + dispatch status
- 30 payments
- 10 completed dispatches
- 50 email log entries

Use **Faker** for names/addresses. Use **real HSN codes** and **real GST rates** (5%, 12%, 18%, 28%) to ensure tax math demos work. The primary seed tenant (Demo Solar Distributors) is in **Maharashtra** — make sure some of its dealers are in MH (intra-state, CGST+SGST) and some are out of state (IGST) for demo coverage of both tax paths. The secondary seed tenant (Sample Industrial Co) is in a different state (Karnataka) to exercise cross-tenant isolation tests. **Both seed tenants are illustrative — neither represents a real customer; real tenants are onboarded through the standard provisioning flow.**
