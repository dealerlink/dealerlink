# Tax Invoice + Ship-To GSTIN Audit — Stage F Day 19

> **Date:** 2026-09-06
> **Task:** F.2 (tax invoice existence audit) + F.5 scoping (Ship-To GSTIN)
> **Method:** read-only static audit of the monorepo at `main`. No application
> code was changed while auditing.
> **Companion docs:** `CLAUDE.md` §4–§6, `docs/STAGE_F_BUILD_v2.md`,
> `docs/PHASE_2_PLAN_v2.md` (SP0.2, SP1.2), `docs/WORKFLOWS.md`.

---

## Part A — GST Tax Invoice

# VERDICT: **DOES NOT EXIST**

There is **no GST tax invoice document type in Dealerlink.** Not partially, not
behind a flag. What exists is _reserved scaffolding_: the string `'invoice'` is
declared in two enums and one settings default so that adding the module later
needs no migration to those three places. Every functional layer — table,
counter call site, template, route, server action, permission — is absent.

The `'invoice'` enum member is a **deliberate placeholder**, and the code says
so out loud. `apps/workers/src/jobs/render-pdf.ts` **throws** on it:

```ts
// apps/workers/src/jobs/render-pdf.ts:56
if (payload.documentType !== 'quotation' && … !== 'dispatch') {
  throw new Error(
    `render-pdf: documentType "${payload.documentType}" is not implemented yet …`,
  );
}
```

`'invoice'` is not in that allow-list. Any attempt to render one throws today.

### A.1 Evidence table — every place checked

| #   | Surface checked                          | Location                                            | Result                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Invoice table**                        | `packages/db/src/schema/`                           | ❌ **ABSENT.** 22 schema files; `performa-invoice.ts` exists, there is no `invoice.ts`. No `invoices` / `invoice_lines` / `invoice_status_history` pgTable anywhere.                                                                                               |
| 2   | **`document_counters` doc types in use** | `nextCounter(tx, tenantId, docType, fy)` call sites | ❌ **`'invoice'` never allocated.** Live doc types: `quotation`, `performa_invoice`, `order`, `payment`, `dispatch`, `dealer` (non-fiscal, fy=0). `document_counters.docType` is free-text `text()` — no enum blocks adding `'invoice'`, but nothing allocates it. |
| 3   | **`generated_documents` types**          | `packages/db/src/schema/generated-document.ts:17`   | ⚠️ **`'invoice'` IS in the pg enum** — declared up front with the comment "`invoice` (tax invoice) … follow in later days … so the render-pdf job and the storage table do not need a migration each time". Declaration only; nothing writes a row with it.        |
| 4   | **PDF template directory**               | `apps/workers/src/templates/`                       | ❌ **No invoice template.** Present: `quotation.tsx`, `performa-invoice.tsx`, `dispatch-note.tsx`, `payment-receipt.tsx`, plus `_components/` + `styles.ts` + `types.ts`. There is **no `tax-invoice.tsx`**.                                                       |
| 5   | **render-pdf job**                       | `apps/workers/src/jobs/render-pdf.ts:28,56`         | ⚠️ **Declared, then rejected.** `'invoice'` is in `RenderableDocumentType`, and the guard **throws** "not implemented yet" for it.                                                                                                                                 |
| 6   | **Email document types**                 | `packages/schemas/src/email.ts:57`                  | ⚠️ `'invoice'` in the enum. Declaration only — no send path constructs one.                                                                                                                                                                                        |
| 7   | **`tenant_settings` doc prefixes**       | `packages/db/src/schema/tenant-settings.ts:47`      | ⚠️ **`invoice: 'INV'` default exists.** A prefix with nothing to prefix. The operator UI shows the field (`tenant-detail-sections.tsx:817` — `{ key: 'invoice', label: 'Tax invoice' }`), so operators can already configure a series that is never consumed.      |
| 8   | **`tenant_settings` bank-detail usage**  | `apps/workers/src/templates/_components/Footer.tsx` | ✅ **Bank details DO render — on four other documents.** `Footer` renders a Bank Details block, and quotation, performa-invoice, dispatch-note and payment-receipt all pass `bank`. **None of them is a tax invoice.**                                             |
| 9   | **Orders module routes**                 | `apps/web/app/(app)/orders/`                        | ❌ `page.tsx`, `[id]/page.tsx`, `[id]/order-actions.tsx`, `loading.tsx`, `order-status.ts`. **No invoice route, no "Generate invoice" action.**                                                                                                                    |
| 10  | **Dispatch module routes**               | `apps/web/app/(app)/dispatch/`                      | ❌ list / `[id]` / `new` / `loading` / status only. No invoice route.                                                                                                                                                                                              |
| 11  | **Server actions**                       | `apps/web/lib/actions/`                             | ❌ **No `invoices/` directory.** `find … -iname "*invoice*"` matches only `pi/` (performa). Orders expose `confirm-order.ts` + `order-lifecycle.ts`; dispatch exposes `create-dispatch.ts`, `dispatch-lifecycle.ts`, `pdf.ts`.                                     |
| 12  | **Permissions**                          | `lib/actions/wrap.ts` role matrix                   | ❌ No invoice action exists to gate. CLAUDE.md §6 already _promises_ the capability — Accounts "generate invoices" — but nothing implements it.                                                                                                                    |

### A.2 Resolving the documented contradiction

The brief flagged three sources that appear to disagree. They do not — two are
right and one is **wrong documentation**:

- ✅ **`docs/PILOT_GETTING_STARTED.md`** — describes quotation → PI → order →
  payment → dispatch → delivered **with no invoice step**. This is **correct**
  and matches the code exactly.
- ✅ **`packages/db/src/schema/dispatch.ts:30`** — "A dispatch is tax-neutral —
  it is NOT a tax invoice (that is a Phase 2 module)". **Correct**, and it
  names the gap accurately. `docs/WORKFLOWS.md:206` repeats it correctly.
- ❌ **`docs/PILOT_GETTING_STARTED.md:135`** — "print on the footer of **every
  tax invoice**", echoed by `docs/PILOT_ONBOARDING_PRODUCTION.md:59` and
  `docs/RUNBOOKS.md:21` ("printed on tax invoices"). **This copy is wrong.**
  Bank details are real and they do print — on quotations, PIs, dispatch notes
  and payment receipts. The phrase "tax invoice" in that sentence describes a
  document that does not exist.

**Disposition:** the bank fields are not evidence of an invoice. They are
evidence of a **documentation defect** — user-facing onboarding copy naming a
document Dealerlink cannot produce. A pilot tenant following
`PILOT_GETTING_STARTED.md` will go looking for an invoice screen and not find
one. Fixing that copy is a ~15-minute docs change and should ride along with
F.6 (or sooner). **It is not a code change and is deliberately not made today**
(Day 19 is audit-and-patch; changing pilot-facing copy is out of scope).

### A.3 What is missing — precise gap list

| Layer                 | Missing                                                                                                                                 | Notes                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schema**            | `invoices`, `invoice_lines`, `invoice_status_history`                                                                                   | Mirror `performa-invoice.ts` exactly. Needs `tenant_id` + RLS (`ENABLE` **and** `FORCE`) + `tenant_isolation` USING/WITH CHECK, `tenant_id`-leading indexes, `audit_trg`. Per-line `hsnCode` + `gstRate` (see §A.5). Must carry `tenantStateAtIssue` + `placeOfSupply` (Ship-To state, ADR-012). Nullable `irn`/`ackNo`/`ackDate`/`signedQrPayload` reserved for F.24 so the e-invoice work is not a second migration. |
| **Counter series**    | `nextCounter(tx, tenantId, 'invoice', fiscalYear)`                                                                                      | **No migration needed** — `document_counters.docType` is free-text and `docPrefixes.invoice = 'INV'` already defaults. Format `INV-2026-0001`, resets 1 April (CLAUDE.md §4.3).                                                                                                                                                                                                                                        |
| **Template**          | `apps/workers/src/templates/tax-invoice.tsx`                                                                                            | **Blocked on F.4.** The shared `TaxSummary` component is **single-rate** — it takes one `gstRateLabel` and renders one CGST/SGST or IGST pair. A GST tax invoice legally requires a **rate-wise** tax summary and an HSN/SAC table. That is exactly F.3/F.4 (Days 20–21), so F.6 must land after them.                                                                                                                 |
| **render-pdf wiring** | Remove `'invoice'` from the throw guard; add `buildTaxInvoiceHtml`                                                                      | `RenderableDocumentType` + `generated_document_type` enums **already contain** `'invoice'` — no enum migration.                                                                                                                                                                                                                                                                                                        |
| **Route**             | `apps/web/app/(app)/invoices/` — list, `[id]` detail                                                                                    | Plus an entry point from the order detail page ("Generate tax invoice").                                                                                                                                                                                                                                                                                                                                               |
| **Server actions**    | `apps/web/lib/actions/invoices/` — `createInvoiceFromOrder`, `generateInvoicePdf`, `downloadInvoicePdf`, `sendInvoice`, `cancelInvoice` | All via `tenantAction()`. Cancellation must be a **credit note** (F.8), not a delete — a GST invoice is immutable once issued.                                                                                                                                                                                                                                                                                         |
| **Permissions**       | Wire the roles                                                                                                                          | Per CLAUDE.md §6: **Accounts** generates invoices; **Admin** everything; **Sales** read-only; **Dispatch** read-only. Cancel/credit-note = admin only.                                                                                                                                                                                                                                                                 |
| **Seeds**             | Seeded invoices per tenant                                                                                                              | Needed for the verify spec and for F.9/F.10 (GST report + GSTR-1) to have data.                                                                                                                                                                                                                                                                                                                                        |

### A.4 Day-sized build spec for the gap

**Prerequisite: F.3 + F.4 must land first** (multi-rate tax summary + HSN/SAC
table). Building the invoice template against today's single-rate `TaxSummary`
would produce a document that is wrong for any mixed-rate order — and mixed-rate
is the client's actual case (the Maharudra screenshots show 5% and 18% in one
ledger set).

| #   | Work item                                                                                                                                                                                       | Est.                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Schema: 3 tables + migration + RLS policies + audit triggers + indexes                                                                                                                          | 3.0 h                     |
| 2   | `packages/db` invoice tests (RLS isolation, counter atomicity, immutability)                                                                                                                    | 2.0 h                     |
| 3   | Numbering: `'invoice'` counter + `INV-YYYY-NNNN` formatting + fiscal reset test                                                                                                                 | 1.0 h                     |
| 4   | `createInvoiceFromOrder` — atomic: allocate number, snapshot lines from `order_lines`, freeze `tenantStateAtIssue` + `placeOfSupply`, recompute via `@dealerlink/tax`, insert, transition order | 3.5 h                     |
| 5   | Remaining server actions (`generateInvoicePdf`, `download`, `send`, `cancel`) + role gating                                                                                                     | 2.5 h                     |
| 6   | Invoice list + detail UI, and the order-detail entry point                                                                                                                                      | 5.0 h                     |
| 7   | `tax-invoice.tsx` PDF template (reuses Header / PartyBlock / Footer; **consumes F.4's** multi-rate TaxSummary + HSN table) + render-pdf wiring                                                  | 4.5 h                     |
| 8   | Template + action unit tests                                                                                                                                                                    | 2.5 h                     |
| 9   | Seeds (invoices per tenant, incl. one mixed-rate and one inter-state)                                                                                                                           | 1.5 h                     |
| 10  | `verify-day-N.spec.ts` + docs (WORKFLOWS.md, USER_MANUAL.md)                                                                                                                                    | 2.0 h                     |
|     | **Total**                                                                                                                                                                                       | **27.5 h ≈ 3.5 dev-days** |

> ⚠️ **Plan variance.** `STAGE_F_BUILD_v2.md` allocates F.6 **two** days
> (23–24). This audit estimates **3.5**. The gap is items 4 and 6 — creating an
> invoice from an order is a money-touching atomic transaction with a frozen
> tax snapshot, and the UI is a full list+detail module, not a screen. Either
> widen F.6 to 3.5 d or split the PDF template into F.7's day. Flagged, not
> resolved — that is a planning call.
>
> `PHASE_2_PLAN_v2.md` SP1.2 estimated "0 d if exists, else 4–6 d". The verdict
> is **does not exist**, so SP1.2 is live; 3.5 d sits inside that band because
> the enums, counter infrastructure, tax engine and PDF component library
> already exist.

### A.5 Per-line GST rate and HSN storage — **CONFIRMED**

Day 20 (F.3) groups by **both** GST rate and HSN. Both are stored, on every
line table, `NOT NULL`, with CHECK constraints. Day 20 is unblocked.

| Table                    | HSN column                                                  | GST rate column                                | Constraints                                                                |
| ------------------------ | ----------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| `quotation_lines`        | `hsnCode` `text()` **NOT NULL** (`quotation.ts:150`)        | `gstRate` `decimal(5,2)` **NOT NULL** (`:157`) | `quotation_lines_gst_rate_chk`: `gstRate IN (0,5,12,18,28)` (`:171`)       |
| `performa_invoice_lines` | `hsnCode` `text()` **NOT NULL** (`performa-invoice.ts:157`) | `gstRate` `decimal(5,2)` **NOT NULL** (`:162`) | `performa_invoice_lines_gst_rate_chk` (`:175`)                             |
| `order_lines`            | `hsnCode` `text()` **NOT NULL** (`order.ts:150`)            | `gstRate` `decimal(5,2)` **NOT NULL** (`:155`) | `order_lines_gst_rate_chk` (`:172`)                                        |
| `products` (source)      | `hsnCode` `text()` **NOT NULL** (`product.ts:37`)           | `gstRate` `decimal(5,2)` **NOT NULL** (`:38`)  | `products_hsn_chk`: `~ '^[0-9]{4,8}$'`; `products_gst_rate_chk` (`:71–72`) |

**Notes for Day 20:**

- Rate and HSN are **snapshotted onto each line at creation**, not joined from
  `products` at read time. Correct for a tax document — a later catalog edit
  cannot retroactively change an issued document. Group by the **line**
  columns, never by `products`.
- `gstRate` is `decimal` and drizzle returns it as a **string** (no `mode`
  override anywhere — 48 decimal columns, all default). Group on the
  normalised numeric value, not the raw string, or `'18'` and `'18.00'`
  become two buckets.
- The HSN CHECK (4–8 digits) is enforced on `products` only. The line tables
  take free `text()` — a line copied from a product is well-formed today, but
  F.9/F.10 (GSTR-1 HSN summary) should not assume it.
- ⚠️ **The `gstRate IN (0,5,12,18,28)` CHECK omits 3%.** Not a Day 20 blocker
  (the client's rates are 5/12/18/28), but it will reject a 3% line if a tenant
  ever needs one, and GSTR-1 accepts 3%. Worth a migration when convenient.

---

## Part B — Ship-To GSTIN (F.5 scoping)

# VERDICT: **COLUMN EXISTS, VALIDATION INADEQUATE**

`dealers.gstin` exists and is format-checked. It has **no checksum validation
and no state-code cross-check**, it is **nullable and always optional**, and
nothing blocks a dispatch that is missing it. A checksum validator **already
exists in the codebase** but is wired only to the tenant's own GSTIN.

### B.1 Ship-To is a dealer — **CONFIRMED, and broader than stated**

The brief named two tables. There are **three**:

| Table               | Column                                                                     | References   |
| ------------------- | -------------------------------------------------------------------------- | ------------ |
| `performa_invoices` | `shipToDealerId` (`performa-invoice.ts:66`)                                | `dealers.id` |
| `orders`            | `shipToDealerId` (`order.ts:71`)                                           | `dealers.id` |
| `dispatches`        | `shipToDealerId` (`dispatch.ts:56`, + index `dispatches_tenant_shipto_ix`) | `dealers.id` |

There is **no separate shipping-address entity.** Ship-To is a dealer row,
full stop.

> ⚠️ **This directly contradicts the F.5 scope in `STAGE_F_BUILD_v2.md`,** which
> says: _"Add GSTIN to the shipping address record, not to `dealers` — one
> dealer can ship to multiple sites with different registrations."_
> **There is no shipping address record to add it to.** F.5 as written silently
> assumes a table that does not exist. Its real first task is a schema decision
> that is not in its 2-day estimate — see §B.4.

### B.2 Column exists: **YES** — `dealers.gstin`

| Property | Value                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Column   | `gstin` `text()` — `packages/db/src/schema/dealer.ts:59`                                                                                |
| Nullable | **YES.** No `.notNull()`. Optional for every dealer, Ship-To or not.                                                                    |
| DB CHECK | `dealers_gstin_not_empty_chk` (`:107`) — `gstin IS NULL OR gstin <> ''`. **Empty-string guard only. No format check at the DB layer.**  |
| Unique   | `dealers_tenant_gstin_uq` (`:93`) on `(tenant_id, gstin)` `WHERE gstin IS NOT NULL` — partial unique, per-tenant. ✅                    |
| Related  | `dealers.state` `text()` (`:54`), CHECK `~ '^[A-Z]{2}$'` (`:109`) — ISO 3166-2:IN alpha code (`MH`), indexed `dealers_tenant_state_ix`. |

### B.3 Validation present — format only

| Check                               | Status                          | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Format (15-char structure)**      | ✅ **PRESENT** (app layer only) | `packages/schemas/src/dealer.ts:13,46` — `/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}$/`, uppercased, `.or(z.literal(''))` `.optional()`. Correct structure: 2-digit state + 10-char PAN + entity + `Z` + check char.                                                                                                                                                                                                                  |
| **Checksum (check digit)**          | ❌ **MISSING for dealers**      | The dealer schema uses the bare regex. **A correct mod-36 GSTN checksum validator already exists** — `apps/web/lib/format/index.ts:127` `isValidGSTINChecksum`, `:151` `isValidGSTIN`, `:158` `gstinCheckChar`, with tests at `lib/format/gstin.test.ts`. It is wired **only** to `lib/admin/schemas.ts:44` (`isValidGSTIN`, "GSTIN format or check digit is invalid") — the **tenant's own** GSTIN, operator-facing. Dealers never call it. |
| **State-code cross-check**          | ❌ **MISSING entirely**         | Nothing compares GSTIN chars 1–2 (numeric GST state code, e.g. `27`) against `dealers.state` (ISO alpha, e.g. `MH`). **The mapping does not exist**: `packages/schemas/src/states.ts` keys `INDIAN_STATES` by ISO alpha code only. There is **no numeric-GST-code ↔ ISO-code table anywhere in the repo.** F.5 must build one (~37 entries incl. UTs).                                                                                       |
| **Required when Bill-To ≠ Ship-To** | ❌ **NOT ENFORCED**             | GSTIN is optional on every dealer. `createDispatch` performs no GSTIN check (`grep gstin apps/web/lib/actions/` → only tenant admin + dealer CRUD/import). A dispatch to a different-party consignee with no Ship-To GSTIN succeeds today.                                                                                                                                                                                                   |
| **Dispatch blocked when missing**   | ❌ **NOT IMPLEMENTED**          | No guard in `packages/db/src/dispatch/create.ts` or `lib/actions/dispatch/`.                                                                                                                                                                                                                                                                                                                                                                 |

**The most useful finding in Part B:** the hard part of F.5 — a correct,
tested GSTN mod-36 checksum — **is already written and passing tests.** It is
in the wrong package (`apps/web/lib/format`, not `packages/schemas`) and wired
to the wrong entity. Much of F.5 is _promotion and re-wiring_, not new
cryptographic-ish code.

### B.4 Remaining work for F.5

**Blocking design decision first (not in the current F.5 estimate):**
`STAGE_F_BUILD_v2.md` asks for GSTIN on a "shipping address record" so one
dealer can ship to multiple registrations. **That entity does not exist.**
Two options, and this is a call for the operator, not a default to pick:

- **(a) Keep Ship-To as a dealer.** Cheapest. Multiple ship-to sites = multiple
  dealer rows. Fits every existing FK, no migration to PI/order/dispatch. But
  it does not deliver the "one dealer, many registrations" property the build
  doc explicitly asked for, and it pollutes the dealer master.
- **(b) Introduce `dealer_addresses`.** Delivers the stated requirement. Costs
  a new table + RLS + audit + backfill + a nullable `shipToAddressId` on three
  tables + UI on three flows. **Adds 2–3 d beyond the estimate below** and is
  a schema change every downstream task (F.6, F.24, F.25) reads — so it must
  be settled before F.6, exactly as D-3 argues.

**Estimate assuming option (a).** Option (b) adds 2–3 d on top.

| #   | Work item                                                                                                                                                                                                                           | Est.                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | Promote `isValidGSTIN` / `isValidGSTINChecksum` / `gstinCheckChar` from `apps/web/lib/format` into `@dealerlink/schemas` (shared client+server per CLAUDE.md §3); re-point `lib/admin/schemas.ts` at the new home; keep tests green | 2.0 h                     |
| 2   | Build the numeric-GST-code ↔ ISO-3166-2:IN map in `packages/schemas/src/states.ts` (~37 entries) + `gstStateCodeFor(iso)` / `isoFromGstStateCode(nn)` + tests                                                                       | 2.5 h                     |
| 3   | Add checksum + state-code cross-check to `dealerCoreSchema.gstin` (cross-field `superRefine`: GSTIN chars 1–2 must map to `state`), with a specific message per failure mode                                                        | 2.5 h                     |
| 4   | Conditional-requirement rule: Ship-To GSTIN required when Bill-To dealer ≠ Ship-To dealer. Pure, unit-tested predicate                                                                                                              | 1.5 h                     |
| 5   | Block dispatch confirmation when required-and-missing, error naming the dealer; enforce in `packages/db/src/dispatch/create.ts` (**not** only the action, so it cannot be bypassed)                                                 | 2.5 h                     |
| 6   | Backfill migration + settings report listing dealers needing a GSTIN before dispatch                                                                                                                                                | 3.0 h                     |
| 7   | UI: inline validation + a clear "required because Ship-To ≠ Bill-To" hint on dealer form + dispatch form                                                                                                                            | 3.0 h                     |
| 8   | Tests (checksum fixtures, mismatch rejection, dispatch block, same-party unaffected) + verify spec                                                                                                                                  | 3.5 h                     |
| 9   | Docs — `WORKFLOWS.md`, `USER_MANUAL.md`, DEVIATIONS entry                                                                                                                                                                           | 1.0 h                     |
|     | **Total (option a)**                                                                                                                                                                                                                | **21.5 h ≈ 2.7 dev-days** |
|     | **Total (option b)**                                                                                                                                                                                                                | **≈ 5 dev-days**          |

> `STAGE_F_BUILD_v2.md` allocates F.5 **2 days**. Option (a) needs ~2.7;
> option (b) ~5. The overrun is items 2, 6 and 7 — the state-code map, the
> backfill report, and validation surfaced across two flows.

### B.5 Constraint carried into F.5 from CLAUDE.md §5

**Ship-To GSTIN must not touch place-of-supply derivation.** Place of supply is
derived from the Ship-To **address state** (`dealers.state`) per ADR-012 /
IGST Act §10, and that is already correct. The GSTIN is _reported alongside_
it. The state-code cross-check in item 3 exists to catch a **data-entry error**
(a GSTIN whose embedded state disagrees with the address), not to become a
second source of truth for tax classification. `STAGE_F_BUILD_v2.md` states
this explicitly and this audit concurs.

---

## Summary

| Question                            | Answer                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Does a GST tax invoice exist?**   | **NO.** Enum placeholders in 3 files; `render-pdf` throws on `'invoice'`. No table, counter call site, template, route, action or permission.  |
| **Per-line GST rate + HSN stored?** | **CONFIRMED** — `hsnCode` + `gstRate` NOT NULL on `quotation_lines`, `performa_invoice_lines`, `order_lines`. **Day 20 is unblocked.**         |
| **Ship-To a dealer?**               | **CONFIRMED** — and on `orders` too, not just PI + dispatch. No shipping-address entity exists.                                                |
| **Ship-To GSTIN column?**           | **YES** — `dealers.gstin`, nullable, per-tenant unique, empty-string CHECK only.                                                               |
| **Validation?**                     | **Format only.** No checksum (though a working one exists elsewhere in the repo), no state cross-check, never required, never blocks dispatch. |

**Two plan variances flagged for the operator, not silently resolved:**

1. **F.6 needs ~3.5 d, allocated 2 d.** And it is **hard-blocked on F.4** —
   `TaxSummary` is single-rate today, and a mixed-rate invoice is the client's
   real case.
2. **F.5's stated scope assumes a `shipping address record` that does not
   exist.** Its true first step is an (a)-or-(b) schema decision worth 0 or
   2–3 extra days, and it must be settled before F.6 lands.

_Audit produced Stage F Day 19 (2026-09-06) — task F.2 + F.5 scoping._
