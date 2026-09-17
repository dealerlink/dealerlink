# Sample Data (BRD §7)

> **Scope:** Required seed volumes and the two demo tenants used for development + isolation testing. Back to [CLAUDE.md](../CLAUDE.md).

Seed scripts live in `packages/db/seeds/`. Required volumes:

- 2 tenants for development and isolation testing:
  - **`Demo Solar Distributors`** (primary seed tenant, based in Maharashtra) — exercises intra-state CGST+SGST tax paths
  - **`Sample Industrial Co`** (secondary seed tenant, based in Karnataka) — exercises a different vertical's custom fields and provides cross-tenant RLS isolation testing
- 8 users (4 per tenant): 1 Admin + 2 Sales + 1 Accounts + 1 Dispatch
- 3 manufacturers: Premier Energies, Adani Solar, Vikram Solar
- 25 product SKUs per tenant across **four HSN codes and three GST rates** — see "The catalogue is multi-rate" below
- 20 dealers across MH, AS, KA, TN, GJ, UP, RJ — varied Type/Category/Risk
- ~500 inventory items with serial numbers
- 30 deals across all 9 pipeline stages
- 15 quotations (Draft/Sent/Accepted)
- 20 orders with mixed payment + dispatch status
- 30 payments
- 10 completed dispatches
- 50 email log entries

Use **Faker** for names/addresses. Use **real HSN codes** and **real GST rates** (5%, 12%, 18%, 28%) to ensure tax math demos work. The primary seed tenant (Demo Solar Distributors) is in **Maharashtra** — make sure some of its dealers are in MH (intra-state, CGST+SGST) and some are out of state (IGST) for demo coverage of both tax paths. The secondary seed tenant (Sample Industrial Co) is in a different state (Karnataka) to exercise cross-tenant isolation tests. **Both seed tenants are illustrative — neither represents a real customer; real tenants are onboarded through the standard provisioning flow.**

## The catalogue is multi-rate (F.81)

Until F.81 the seeded catalogue was **single-rate**, which was drift from the
"real GST rates" requirement above rather than a deliberate simplification:
`day5.ts` `generateProducts()` emitted 20 products all at `gstRate: '18'` /
`hsnCode: '85414300'`, and `day13.ts` added a 21st at `'85414011'` / `'18.00'`.
Two HSN codes, one rate. Any rate-wise or HSN-wise assertion written against
that corpus passed whether or not the code under test worked.

`packages/db/src/seeds/multi-rate.ts` adds four products per tenant and the
documents that use them. The catalogue after a full `pnpm db:seed` is **25
products, four HSN codes, three rates**:

| SKU          | Name                           | HSN        | GST |
| ------------ | ------------------------------ | ---------- | --- |
| `MR-MOD-555` | Premier 555W TOPCon Module     | `85414300` | 5%  |
| `MR-MOD-585` | Adani 585W Mono PERC Module    | `85414300` | 5%  |
| `MR-INV-5K`  | Growatt 5kW Hybrid Inverter    | `85044090` | 12% |
| `MR-ISO-40A` | Havells 40A DC Isolator Switch | `85359090` | 18% |

The other 21 are unchanged, all at 18% on `85414300` / `85414011`.

**The product-to-rate mapping is fixture realism and asserts no statutory
rate.** HSN `85414300` appears at 5% on the new modules and at 18% on the
twenty pre-existing panels, and that inconsistency is deliberate — see Chain B.
The client's own voucher bills `85414300` at 5%; the seed keeps both readings
rather than reconciling them, because the point of the fixture is to exercise
grouping code, not to state tax law.

### The two document chains

Both are built for **both tenants** (`demo` in MH, `sample` in KA).

**Chain A — intra-state, one rate per HSN, three rate groups.** Lines run
`18 / 5 / 12 / 5`. Two properties are load-bearing and should not be
"simplified":

- The line order is **not ascending by rate**, so a missing ascending sort
  fails rather than passing by accident.
- There are **two lines at 5%**. 5% is the only rounding-sensitive rate in this
  corpus under the intra-state CGST/SGST split — its half is 2.5%, which lands
  off 2dp on half of all integer line subtotals, while 0/12/18/28 have
  whole-percentage halves and are exact. With a single 5% line, per-line and
  document-level rounding agree trivially. With two they do not: this document
  gives CGST `10073.01` per-line against `10073.00` document-level, so a
  regression of the per-line rounding model is visible instead of silent.

**Chain B — inter-state (IGST), one HSN carrying two rates.** Lines run
`18 / 5 / 18`, where line 1 is a pre-existing panel on `85414300` at 18% and
line 2 is the new module on the **same HSN** at 5%. The HSN partition and the
rate partition therefore differ, which is the case an HSN table implemented by
grouping on rate gets wrong — it emits three rows where there should be two.
Chain A structurally cannot detect that. Chain B also carries the mixed-rate
**order**, in status `confirmed` because the GST summary report counts only
supply statuses.

### Totals come from the production engine

`multi-rate.ts` computes every stored total with `computeTax` from
`@dealerlink/tax` — the same function `apps/web`'s quotation and PI actions
call — rather than with `day8.ts`'s local `computeTotals`. `computeTotals`
rounds on IEEE-754 doubles and can differ from the engine by a paisa on a
mixed-rate document with a discount. Converting it to Decimal is filed as
**F.86** and measured as a zero-diff change; it is not a blocker here.
