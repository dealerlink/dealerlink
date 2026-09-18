# F.3 / F.4 — Multi-rate GST summary and HSN/SAC table

**Status:** specification. Written against `docs/F3_F4_AUDIT.md`; that audit is
the authority on _where_, this document is the authority on _what_ and _why_.
Do not restate site lists here — cite the audit section.

**Why this is the priority.** A quotation combining a 5% panel and an 18%
earthing kit renders incorrectly today. Swipe's preview handles it correctly
(`docs/client-evidence/4.png`). Until this ships, Dealerlink loses a
side-by-side demo on the prospect's most common document shape.

**No operator sign-off gate** — ruled out. Day 26's gate covered template
fidelity against the Chromium references; this changes what the templates
render, and the acceptance criteria below are mechanical rather than visual.

---

## 1. Prerequisites — in this order

Both land before F.3. **F.81 first, then F.55** — operator decision, 2026-09-17.
F.81 needs only rates from `{0, 5, 12, 18, 28}`, every one of which all nine
rate-list constants already accept, so it does not depend on F.55. The
dependency would only reverse if a 3% product were wanted, and it is not wanted
yet: F.55 widens a union on a protected surface, so it lands first and a
separate filed row then adds the 3% fixture, giving the widened union a fixture
the same day something can exercise it.

|     | Task                                                | Why it blocks                                                                                                     |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | **F.81** — multi-rate seed                          | 21 seeded products, all 18%, and no mixed-rate document anywhere. F.3 cannot be tested against the current corpus |
| 2   | **F.55** — 3% missing from nine rate-list constants | Rate lists are touched throughout this work. Fixing it after means editing the same nine constants twice          |

**F.81 ships SEED DATA ONLY.** It must produce, per tenant:

- at least one product at 5% with a distinct HSN, and one at 18%;
- a **mixed-rate quotation**, its **PI**, and a **mixed-rate ORDER**. The order
  is not optional: §7's report grouping reads `orders` only
  (`apps/web/lib/reports/gst-summary.ts:83`), so without one, half of F.3 is as
  untestable as F.4 is today.

A third rate is preferable — three groups catch ordering and pluralisation bugs
that two do not — and must come from `{0, 12, 28}` until F.55 lands.

**F.81 does NOT add a reference case.** The 14 files in `docs/pdf-references/`
are a _cross-renderer contract_: Chromium output that the Typst templates must
match. A Typst self-capture is a _regression freeze_ — a different guarantee —
and filing both in the same directory at equal status is a category error. A
mixed-rate baseline captured before F.4 would also freeze the audit §1.3 defect
(the empty rate label) as though it were correct. **F.4 creates the mixed-rate
golden file, as a Typst snapshot, once the rendering is right**, landing with
the snapshot tests that assert on it.

Note for whoever schedules the capture: `apps/workers/scripts/capture-references.ts`,
which `docs/pdf-references/README.md:21-22` and `docs/RUNBOOKS.md:1667` both
name as the capture tool, **no longer exists** — it went with the Chromium
pipeline on Day 27. R25's recipe is unrunnable as written; filed separately.

---

## 2. What must appear

From `docs/client-evidence/4.png` (PFI-2033), the prospect's own mixed-rate
document. This is the target, not an invention.

**Rate-wise tax block** — one line per distinct rate actually present:

```
CGST 2.5%    13,671.00
SGST 2.5%    13,671.00
CGST 9.0%       211.50
SGST 9.0%       211.50
```

Inter-state substitutes `IGST 5%` / `IGST 18%` for each pair.

**HSN/SAC summary table** — one row per distinct HSN, plus a TOTAL row:

| HSN/SAC   | Taxable Value   | Central Rate | Central Amt   | State Rate | State Amt     | Total Tax     |
| --------- | --------------- | ------------ | ------------- | ---------- | ------------- | ------------- |
| 85414300  | 5,46,840.00     | 2.5%         | 13,671.00     | 2.5%       | 13,671.00     | 27,342.00     |
| 85359090  | 2,350.00        | 9%           | 211.50        | 9%         | 211.50        | 423.00        |
| **TOTAL** | **5,49,190.00** |              | **13,882.50** |            | **13,882.50** | **27,765.00** |

Inter-state collapses the central/state pairs into a single Integrated Tax
column pair. The audit records that SAC appears in zero source files; the column
is labelled HSN/SAC because services may appear later, but no SAC handling is in
scope.

---

## 3. Data layer (F.3)

Add a single computation returning three views. Exact naming and module
placement follow the audit's enumeration of the tax package.

```
{
  byRate: Array<{
    rate, taxableValue,
    cgstRate, cgstAmount, sgstRate, sgstAmount,
    igstRate, igstAmount
  }>,
  byHsn: Array<{
    hsn, taxableValue,
    centralRate, centralAmount, stateRate, stateAmount,
    integratedRate, integratedAmount,
    totalTax
  }>,
  totals: {
    taxableValue, totalCgst, totalSgst, totalIgst, totalTax,
    roundOff, grandTotal
  }
}
```

**Grouping rules**

- Group by **distinct rates actually present**, never a fixed rate list. A
  single-rate document produces one group — the existing case becomes a subset,
  not a special case. This is also why F.55 matters less than it would if the
  rate list were load-bearing here.
- Order rate groups ascending by rate; order HSN rows by HSN ascending.
  Deterministic ordering is required for the snapshot tests.
- Intra-state populates the CGST/SGST fields and leaves IGST null; inter-state
  the reverse. Never both.

**Money rules**

- Read from stored per-line columns. **Never recompute tax from rate × taxable
  value.** `CLAUDE.md` §19.
- Round-off is computed **once at document level**, never per group. Rounding
  per group and summing drifts by paise and will break the parity test.
- All four rate columns are `decimal(5,2)` and read back as normalised strings
  (`"18.00"`). Per DEV.135 the hazard is **a DB-read string compared against a
  hand-written literal**, not two DB values disagreeing. Any grouping key
  derived from a rate must be numeric, and any comparison against a literal
  rate list must normalise first.

---

## 4. Invariants

These are the acceptance criteria that matter; everything else is presentation.

1. `sum(byRate.taxableValue) === totals.taxableValue` exactly
2. `sum(byHsn.taxableValue) === totals.taxableValue` exactly
3. Sum of every tax amount across `byRate` equals `totals.totalTax` exactly
4. The same holds across `byHsn`
5. Each of the above equals a direct `SUM` over the line table — the existing
   parity invariant, extended to the two new groupings. The audit enumerates
   the current parity tests; extend them rather than adding parallel ones
6. A single-rate document renders byte-identically to its current output

Property-based tests over 1, 2 and 4 distinct rates, intra-state and
inter-state. Add the extended invariant queries to `docs/RUNBOOKS.md`.

---

## 5. Screen rendering (F.3)

A shared tax-summary component rendering one row per rate group, used in the
quotation builder, PI view, order detail and the saved quotation view.

- The live GST preview must update rate-wise as lines are added, and must still
  flip CGST/SGST ↔ IGST when the Ship-To dealer's state changes. Place of supply
  derivation is unchanged — ADR-012 still governs.
- **Close `UX_FINDINGS` P-7 here** — tax rates are currently hidden in the saved
  quotation view. The customer must be able to verify what they were charged.
  Same code path.
- **Close P-8 here** — tax amounts render at 1 decimal. Force 2 everywhere. Note
  `₹211.50` in the reference: a rate group can legitimately end in `.50` and
  must not display as `₹211.5`.
- Fix the live `<select>` defect the audit identified at
  `product-detail-sections.tsx:255` — a DB-read rate compared against a literal
  option list. It is the only confirmed instance of the real hazard.

  > **NOTE — 2026-09-18 (F.55 D-2).** This item is expected to be **dissolved
  > rather than fixed**, and the line above is kept rather than deleted so the
  > record shows why. F.55 (`docs/F55_SPEC.md` §3) replaces **both** catalogue
  > `<select>`s with a numeric input plus per-tenant suggestions, which removes
  > this `<select>` — and with it the mismatch between `value={form.gstRate}`
  > (the raw DB string `'18.00'`) and the integer option literals. **Removing
  > the affordance is not the same as fixing the comparison**, so if F.55 lands
  > first, F.3 should confirm the defect is gone rather than assume it, and
  > should not re-add a `<select>` to fix it. If F.55 does not land first, this
  > item stands as written.

---

## 6. PDF rendering (F.4)

**The build site is `templates-typst/quotation.typ:97-110`.** The component both
task notes previously named — `templates/_components/TaxSummary.tsx` — is dead
code post-ADR-015 with zero reachable call sites. Do not edit it; the audit
records its status.

- Rate-wise block replaces the single-rate block at that location.
- HSN/SAC table follows it.
- `totals-block()` is caller-driven, so **no `chrome.typ` edit is required**.
  The round-off row's insertion point is `quotation.typ` between `:107` and
  `:108` — the same region these rows occupy. Leave it viable; do not implement
  round-off, which is F.6.
- Page-break behaviour when rate groups or the HSN table split across pages.
- Amount in words reflects the grand total across all groups.
- Apply to quotation, PI and dispatch note as the audit's site list dictates.
  The tax invoice does not exist yet (F.6).

**Determinism holds throughout.** Snapshot tests assert on bytes. The
mixed-rate golden file is created **here, by F.4**, not by F.81 — see §1 — and
it is a Typst snapshot (a regression freeze against this repo's own renderer),
not a member of the Chromium cross-renderer contract in `docs/pdf-references/`.
Record which of the two it is where it lands, so a later reader does not assume
one provenance for all of them. It must reproduce byte-identically across two
independent full reseeds before it counts as a baseline, and the capture must
run through the production path (`renderTypstPdf` + `buildViewModel` +
`resolveGeneratedAt`, as `apps/workers/scripts/determinism-check.ts:51-70`
does) rather than through `scripts/render-typst.ts`, whose view model is a
duplicate that can drift from what the snapshot test renders.

---

## 7. GST Summary report (F.3)

The report currently groups by place of supply and intra/inter-state. The audit
confirms **no rate-keyed or HSN-keyed aggregation exists anywhere** across the
closed set of 22 `GROUP BY` keys.

Add grouping by **rate** and by **HSN**. This is not cosmetic: it is the axis the
prospect's Tally ledgers are organised on (`SALE @ 5% - LOCAL` and the rest), the
axis F.11's export must map to, and the axis they will reconcile against. Doing
it here means F.11 consumes an existing aggregation rather than building one.

---

## 8. Out of scope

- Round-off (F.6) — leave the insertion point viable
- The tax invoice itself (F.6)
- Any change to place-of-supply derivation (ADR-012, and F.5a)
- `packages/tax` behavioural change beyond the new computation — no existing
  fixture may change
- SAC handling
- The `CHECK`-permits-3%-while-the-engine-rejects-it mismatch (F.55)

**No number that appears on any existing document may change.** A single-rate
document must render byte-identically before and after.

---

## 9. Open items for the builder

Report these rather than deciding them:

1. Whether the HSN table belongs on the quotation and PI, or only on documents
   where GST rules require it. The reference shows it on a PI, so the default is
   both — but say if the audit's site list suggests otherwise.
2. Whether any existing reference case becomes mixed-rate under F.81's seed. If
   so, its baseline changes and that must be deliberate, not incidental.
3. Anything in the audit's §8 (could-not-determine) that this spec assumes
   settled.
