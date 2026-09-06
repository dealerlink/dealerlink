# STAGE_F_BUILD.md — v2

> Supersedes v1. **Days 19, 20 and 21 prompts stand exactly as written in v1** —
> nothing below changes them. This version adds three decisions, two new work
> items, and a revised task table.

---

## Decisions log

| #   | Decision                                                                              | Date     | Consequence                                                                                                                            |
| --- | ------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | **Third-party GSP** for e-invoice and e-way bill (ClearTax / Masters India shortlist) | Sep 2026 | Fastest path, ongoing per-IRN cost. Build behind a provider interface so the ERP-intermediary route stays open later without a rewrite |
| D-2 | **Tally mapping is tenant-configurable**, not a fixed standard                        | Sep 2026 | New module F.11. Covers ledgers, tax ledgers, round-off, party groups, stock items and units                                           |
| D-3 | **Ship-To GSTIN is in scope for SP1**                                                 | Sep 2026 | GSTN Advisory 661, effective 1 Aug 2026. Schema change, so it lands before the invoice work                                            |

### D-1 notes for procurement

Two questions to put to both shortlisted providers **before signing**:

1. How does the API handle the April 2026 MFA mandate for automated generation?
   If a human second factor is needed per invoice, the queue-and-retry design in
   F.24 does not work.
2. Can a taxpayer hold API user profiles with more than one GSP at the same
   time? If yes, the client keeps Swipe's e-invoicing live through migration
   instead of a hard cutover — a materially lower-risk go-live.

Note for later: Client ID and Secret are issued to service providers, while the
API username and password are created by each taxpayer for their own GSTIN.
That structure is what makes the ERP-intermediary path viable in future — the
provider interface in F.23 exists so that switch costs days, not weeks.

### D-3 rationale

GSTN Advisory No. 661 requires Ship-To GSTIN in all Bill-To / Ship-To e-way
bill transactions from 1 August 2026, and TallyPrime 7.1 onward requires the
GSTIN wherever Bill-To and Ship-To differ. Dealerlink's three-party model is
the differentiator, so this is not an edge case — it is the main path.

---

## Revised Stage F task table

Replaces section 2 of v1.

| #        | Task                                                                 | Sub-phase | Days  | Status |
| -------- | -------------------------------------------------------------------- | --------- | ----- | ------ |
| F.1      | Security remediation (F-1 CVE, F-2 CSP, F-3 rate-limit, F-4 drizzle) | SP0       | 19    | ⏳     |
| F.2      | Tax invoice existence audit + gap spec                               | SP0       | 19    | ⏳     |
| F.3      | Multi-rate tax summary — data layer + screens                        | SP1       | 20    | ⏳     |
| F.4      | Multi-rate tax summary — PDF + HSN/SAC table                         | SP1       | 21    | ⏳     |
| **F.5**  | **Ship-To GSTIN capture + validation** 🆕                            | SP1       | 22    | ⏳     |
| F.6      | GST tax invoice document                                             | SP1       | 23–24 | ⏳     |
| F.7      | Serials rendered on invoice lines                                    | SP1       | 24    | ⏳     |
| F.8      | Credit note / sales return                                           | SP1       | 25–26 | ⏳     |
| F.9      | GST report: rate-wise + HSN-wise grouping                            | SP1       | 27    | ⏳     |
| F.10     | GSTR-1 export (B2B, B2CL, CDNR, HSN)                                 | SP1       | 28–29 | ⏳     |
| **F.11** | **Tally mapping configuration module** 🆕                            | SP1       | 30–32 | ⏳     |
| F.12     | Tally export — voucher generation engine                             | SP1       | 33–34 | ⏳     |
| F.13     | Tally export — XML output + idempotency                              | SP1       | 35    | ⏳     |
| F.14     | Vendor bill export                                                   | SP1       | 36    | ⏳     |
| F.15     | Data migration importers                                             | SP1       | 37–38 | ⏳     |
| F.16     | Opening balance import                                               | SP1       | 39    | ⏳     |
| F.17     | ADR: serial capture (swap-on-scan)                                   | SP2       | 40    | ⏳     |
| F.18     | Serial bulk import at procurement                                    | SP2       | 41–42 | ⏳     |
| F.19     | `swapReservedSerial` + scan-to-assign                                | SP2       | 43–45 | ⏳     |
| F.20     | Serial format validation per product/tenant                          | SP2       | 45    | ⏳     |
| F.21     | Mobile-responsive / PWA                                              | SP2       | 46–48 | ⏳     |
| F.22     | Dealer price lists                                                   | SP2       | 49–50 | ⏳     |
| **F.23** | **GSP provider abstraction + credential vault** 🆕                   | SP3       | 51    | ⏳     |
| F.24     | E-invoice / IRN                                                      | SP3       | 52–55 | ⏳     |
| F.25     | E-way bill                                                           | SP3       | 56–58 | ⏳     |
| F.26     | Remaining UX defects (P-10, P-11, P-12, P-4/5/6)                     | SP4       | 59    | ⏳     |
| F.27     | `USER_MANUAL.md` sections 3–10                                       | SP4       | 60–61 | ⏳     |
| —        | **GO-LIVE**                                                          |           |       |        |
| F.28     | Payment links / UPI                                                  | post      | —     | ⏳     |
| F.29     | ADR: plugin entitlement architecture                                 | post      | —     | ⏳     |
| F.30     | `docs/PLUGIN_ROADMAP.md`                                             | post      | —     | ⏳     |

**Revised effort:** ~96–150 dev-days to go-live (was 87–137). The increase is
F.5 (+2), F.11 (+5–8, including product and unit mapping folded in from F.12),
and F.23 (+2–3).

---

## F.5 — Ship-To GSTIN capture and validation 🆕

**Sub-phase:** SP1 · **Day:** 22 · **Effort:** 2 d

Placed before the invoice work because it is a schema change everything
downstream reads.

**Scope**

- Add GSTIN to the shipping address record, not to `dealers` — one dealer can
  ship to multiple sites with different registrations.
- **Format validation:** 15 characters — 2-digit state code, 10-character PAN,
  1-character entity number, `Z`, 1-character checksum. Validate the checksum,
  not just the length.
- **Cross-check:** the state code embedded in the Ship-To GSTIN must match the
  state of the Ship-To address. A mismatch is one of the most common IRP
  rejections and it is far cheaper to catch at entry than at IRN generation.
- **Required when Bill-To ≠ Ship-To.** Optional when they are the same party
  and address, where the Bill-To GSTIN already covers it.
- Block dispatch confirmation when Bill-To ≠ Ship-To and Ship-To GSTIN is
  missing, with an error naming the dealer and address — do not defer the
  failure to F.25.
- **Do not** let Ship-To GSTIN override the existing place-of-supply
  derivation. Place of supply stays derived from the Ship-To _address_ state,
  which is already correct. The GSTIN is reported alongside it.
- Backfill migration: existing shipping addresses get a nullable column plus a
  report listing which records need it before dispatch.

**DoD:** invalid checksum rejected at entry; state-code mismatch rejected with
a specific message; dispatch blocked when required and missing; existing
same-party dispatches unaffected; backfill report available in settings.

---

## F.11 — Tally mapping configuration module 🆕

**Sub-phase:** SP1 · **Days:** 30–32 · **Effort:** 5–8 d

Per D-2, there is no universal chart of accounts. The client's own screenshot 4
shows `SALE @ 5% - CENTRAL` alongside `SALES @ 18% - CENTRAL` — singular and
plural in the same ledger set. Tally XML import matches by **exact name
string**, so a mismatch either creates a duplicate ledger or rejects the
voucher. That is the exact failure the client hired us to fix, so a hardcoded
mapping would reproduce it.

### The core design decision: import, then select — never free-type

Free-text ledger names in a settings screen reintroduce the typo problem in a
new place. Instead:

1. **Import** the tenant's Tally masters. They export their list of ledgers and
   stock items from Tally (XML or Excel); we parse it into a
   `tally_master_cache` holding exact names, parent groups and GUIDs.
2. **Map by selection.** Every mapping field is a dropdown sourced from that
   cache. No keyboard entry of a Tally name anywhere in the UI.
3. **Re-import** on demand when their chart of accounts changes, with a diff
   showing which mappings broke.

### What must be mappable

| Mapping                | Detail                                                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sales ledgers**      | `(GST rate × supply type)` → ledger. Rows auto-generated from the rates actually in use, so a tenant with 5%/12%/18%/28% and intra/inter gets 8 rows, not a fixed 4                                                                                      |
| **Output tax ledgers** | CGST / SGST / IGST, with an option for rate-wise tax ledgers where the tenant maintains them                                                                                                                                                             |
| **Round-off ledger**   | Screenshot 5 shows `ROUND OFFS 0.46` — the export must post to it or the voucher will not balance                                                                                                                                                        |
| **Party ledgers**      | Dealer → Tally ledger, plus the parent group for auto-creating new dealers (typically Sundry Debtors)                                                                                                                                                    |
| **Stock items**        | Dealerlink product → Tally stock item name. **This is not optional** — screenshot 5 holds `Premier NDCR TOPCON G12R 615 wp` while their Swipe catalog holds `Premier Energies 620wp topcon dcr`. Two naming conventions, and Tally matches stock by name |
| **Units**              | Dealerlink UOM → Tally unit symbol (`NOS`, `OTH` visible in the screenshots)                                                                                                                                                                             |
| **Purchase ledgers**   | Same rate × supply-type structure, for F.14                                                                                                                                                                                                              |

### Guardrails

- **Export is blocked, loudly, when any mapping is incomplete.** Never fall back
  to a default ledger name, never auto-create a ledger silently. The error names
  the specific unmapped rate, product or unit.
- Mapping changes are audit-logged with before and after values — this is
  financial configuration.
- Mappings are per tenant, RLS-scoped like everything else.
- A **preview mode**: generate the voucher XML for one invoice and display the
  resolved ledger names before the client commits to a full period export.

**DoD:** a tenant with no mapping cannot export; importing a real Tally master
export populates the dropdowns; mapping a mixed-rate invoice resolves to the
four ledgers from screenshot 4; changing a ledger name in Tally and re-importing
surfaces the broken mapping rather than silently failing.

---

## F.23 — GSP provider abstraction + credential vault 🆕

**Sub-phase:** SP3 · **Day:** 51 · **Effort:** 2–3 d

Built before F.24 so the e-invoice and e-way bill work targets an interface
rather than a vendor.

- `EInvoiceProvider` interface: `generateIrn`, `cancelIrn`, `generateEwb`,
  `updatePartB`, `extendEwb`, `cancelEwb`. One concrete implementation now
  (the chosen GSP), with the shape kept honest by a second stub.
- **Per-tenant credentials**, encrypted at rest: the tenant's own GSTIN, API
  username and password. Client ID and Secret are ours, held per environment,
  never per tenant.
- Sandbox / production toggle **per tenant**, so a new tenant onboards against
  sandbox before going live.
- Credentials never logged, never returned to the client, never in error
  messages.

This is what keeps the ERP-intermediary path (registering Dealerlink itself as
an intermediary on the IRP) a later commercial decision rather than a rewrite.

---

## Consequential changes to existing tasks

| Task                     | Change                                                                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F.12 Tally export engine | Now reads mappings from F.11 instead of holding any names. Product and unit mapping moved out into F.11                                                        |
| F.13 XML output          | Adds the preview-one-voucher mode described in F.11                                                                                                            |
| F.14 Vendor bill export  | Now depends on F.11's purchase ledger mapping                                                                                                                  |
| F.24 E-invoice           | Ship-To GSTIN from F.5 is a required payload field. Depends on F.23                                                                                            |
| F.25 E-way bill          | Same. Also: e-way bills must be generated within 180 days of invoice date for AATO above ₹20 crore — validate before submission rather than failing at the API |
| SP0 commercial track     | Changed from "GSP shortlist" to "shortlist ClearTax vs Masters India, ask the two D-1 questions, sign"                                                         |

---

## Client asks — send this week

1. **Tally masters export.** Gateway of Tally → Export → List of Ledgers, and
   the stock item list. XML or Excel. Two minutes for them, and it removes an
   entire class of error from F.11. Do not accept a hand-typed list.
2. **Sign-off on the rate × supply-type ledger mapping** from whoever owns
   their books. Not necessarily a CA — but it must be the person accountable
   when GSTR-1 is filed off those ledgers.
3. **Ship-To GSTINs** for their active shipping addresses, so F.5's backfill
   has data to land on.
4. **Confirm serials on the invoice PDF** are wanted (as Swipe does today with
   26 serials under one line) now that serials are out of scope for Tally.
