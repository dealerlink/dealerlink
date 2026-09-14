# Day 26 — Author the four Typst templates

**Goal:** Quotation, performa invoice, payment receipt and dispatch note
re-authored in Typst, rendering faithfully against Day 25's 14 references.
**No cutover.** The day ends at an operator sign-off gate.

**Estimated time:** 6–8 hours, possibly spilling into a second day

**Deliverable:** Four Typst templates, a side-by-side comparison artifact for
operator review, and a written list of every intentional difference.

---

## Prompt for Claude Code

```
You are implementing Day 26 of the Dealerlink build. Day 25 (PR #13) captured
14 references across four document paths, proved the Typst spike on all four
axes, and closed cross-arch determinism as byte-identical.

Today authors the templates. TODAY IS TEMPLATE AUTHORING ONLY.

Do NOT touch apps/workers/src/jobs/render-pdf.ts. Do NOT remove Chromium,
Puppeteer or @sparticuz/chromium. Do NOT change the queue consumer. Do NOT
touch packages/tax. If you find yourself editing the render pipeline, stop —
that is Day 27, and it happens only after I have approved the visual diff.

PRELIMINARY:
P.1. Read docs/TYPST_SPIKE.md, docs/pdf-references/README.md,
     capture-results.json, docs/PDF_PIPELINE.md, ADR-013, DEV.37 and DEV.70.
P.2. Branch off main. Disjoint work goes on its own branch (Day 25's lesson).
P.3. Run the verifier BEFORE opening the PR (C7a).

==========================================================
PHASE 1 — What must be preserved, exactly
==========================================================
These are not stylistic choices; each has a recorded reason.

1.1. The rich branded body header. DEV.37 keeps this in the BODY, not in a
     page mechanism. Typst's page header/footer machinery is more capable than
     Chromium's, so there will be a temptation to move it. Do not — the
     reference layout is the contract, and moving it changes first-page
     geometry.
1.2. Per-page footer carrying page number and document id. counter(page) is
     native here, which is what DEV.37 wanted and could not have. Match the
     reference's position and wording.
1.3. INR formatting including Indian digit grouping (1,23,456.00, not
     123,456.00). Note from Day 25: the determinism fixture exercises the ₹
     GLYPH only, not the grouping — the amount there is a literal. Grouping is
     therefore unverified by that fixture and must be verified here, against
     a real rendered document with a lakh-scale total.
1.4. State NAMES displayed, codes stored (DEV.70, ISO 3166-2:IN).
1.5. The GST breakdown layout as it exists today. Single-rate only — the
     multi-rate block and the HSN/SAC table are F.3 and F.4, NOT today. Do
     not build ahead of them; the reference is the target.
1.6. Branded and unbranded both render. Day 25 established the logo is an
     <img src> drawing as vector text, so the branded and unbranded references
     share a documentId and the logo is the only delta. Preserve that
     property — it is what makes the diff reviewable.

==========================================================
PHASE 2 — Author the four templates
==========================================================
2.1. Order: payment receipt (simplest), quotation, performa invoice, dispatch
     note (carries the serial list). Getting the shared layout primitives
     right on the simplest document first is cheaper than discovering them on
     the hardest.
2.2. Factor the shared chrome — header, footer, address block, totals block —
     rather than copying it four times. Four divergent copies is how the
     current templates accumulated their inconsistencies.
2.3. THE HARD CASE: the dispatch note's serial list at 500. Day 25 proved
     Typst breaks it cleanly with a repeating header. Verify that holds inside
     the real template, not just the spike fixture.
2.4. Numbers are read and rendered, never computed. No arithmetic in a
     template. Money comes from stored columns per CLAUDE.md.

==========================================================
PHASE 3 — Round-off: do NOT implement it
==========================================================
3.1. Day 25 established the whole-rupee round-off adjustment line is not
     modelled in Phase 1, deliberately, and packages/tax/src/round.ts
     documents why.
3.2. Do not add it today. It is a feature with tax consequences, it belongs to
     F.6, and it is not a rendering concern.
3.3. But DO leave the totals block structured so a round-off line can be
     inserted later without re-laying-out the block. State in the template
     comments where it would go.

==========================================================
PHASE 4 — Compare against the references
==========================================================
4.1. Render all 14 cases from the same seed data that produced the references.
4.2. Produce a SIDE-BY-SIDE comparison artifact I can review without a
     toolchain — rasterise both to PNG at the same DPI and place them
     adjacent, one image per case, or an HTML page embedding both. I should
     not have to open two PDF viewers.
4.3. Write docs/TYPST_DIFF.md listing EVERY difference between reference and
     Typst render, classified as:
     - INTENTIONAL, with the reason
     - UNINTENTIONAL, still to fix
     - UNRESOLVED, with what blocks it
     Do not omit small differences because they look cosmetic. Font metrics
     shifting a column by two points is the kind of thing that compounds
     across four templates and is much cheaper to see now than after cutover.
4.4. Explicitly verify, per case: ₹ renders and extracts; Indian digit
     grouping is correct at lakh scale; page numbering reads "Page X of Y"
     correctly on a multi-page document; the branded case shows the logo and
     the unbranded shows the fallback; state names display, not codes.

==========================================================
PHASE 5 — STOP at the sign-off gate
==========================================================
5.1. Do NOT proceed to cutover. Do NOT merge Day 26 into Day 27.
5.2. Present the comparison artifact and TYPST_DIFF.md, and wait for my
     explicit approval.
5.3. If any difference is UNRESOLVED, say so plainly rather than presenting a
     diff you are hoping I will wave through. An unresolved difference is a
     reason to extend Day 26, not to start Day 27.

GUARDRAILS
- No number that appears on any document may change. This is rendering only.
- packages/tax untouched.
- No changes to the render pipeline, the queue, or the Chromium dependency.
- Do not build the multi-rate tax block or the HSN/SAC table — F.3 and F.4.
- Do not implement round-off.
- Do not re-record a reference to make a diff look better. The references are
  the contract; if a reference is wrong, say so and stop.

WHEN DONE
- Confirm all four templates render all 14 cases
- Present the side-by-side artifact
- State the count of INTENTIONAL / UNINTENTIONAL / UNRESOLVED differences
- Confirm the five Phase 4.4 checks per case
- Confirm the 500-serial case breaks cleanly in the real template
- Tell me Day 26 is complete and awaiting sign-off — do not start Day 27
```

---

## Verification checklist

- [ ] Four templates; shared chrome factored, not copied
- [ ] All 14 reference cases render
- [ ] Side-by-side artifact reviewable without a toolchain
- [ ] `TYPST_DIFF.md` classifies every difference, including cosmetic ones
- [ ] ₹ renders **and** extracts
- [ ] Indian digit grouping correct at lakh scale (unverified by Day 25's fixture)
- [ ] "Page X of Y" correct on a multi-page document
- [ ] Branded shows logo, unbranded shows fallback
- [ ] State names displayed, not codes
- [ ] 500-serial list breaks cleanly with repeating header
- [ ] Round-off **not** implemented; insertion point documented
- [ ] Chromium, Puppeteer and `render-pdf.ts` untouched
- [ ] Zero unresolved differences, or Day 26 extends
