# F.38 — Typst migration (Days 25–27)

Replaces Puppeteer/Chromium with Typst for all PDF rendering. Supersedes
ADR-013.

**Decision record.** `@react-pdf/renderer` was evaluated and rejected on
evidence: issue #3168 renders ₹ (U+20B9) as the character `1` in default
fonts — a _plausible wrong character_ on a currency document, not a visible
failure — and issue #3047 reports that text rendered with fonts registered via
`Font.register` is parsed as garbled symbols by PDF parsers while appearing
correct in viewers. Those interact: a custom font is mandatory to get ₹, and
registering one compromises text extraction. Since byte-stable snapshots are
also unavailable there, PDF verification would have fallen back to image
diffing — slower, more brittle, and a worse verification story than Typst for
roughly one day less work. On documents whose numbers a dealer files ITC
against, that trade does not hold.

**Three days, and the split is deliberate.** Day 25 produces the diff target
and stops. Day 26 authors templates against it. Day 27 cuts over. The operator
sign-off gate sits between 26 and 27 — reference capture is worthless if the
cutover has already happened.

---

## Day 25 — Reference capture and Typst spike

**Goal:** A complete, reviewed set of known-good reference PDFs, and proof
Typst can render the hardest thing these documents do. No template work.

**Estimated time:** 4–6 hours

```
You are implementing Day 25 of the Dealerlink build. This opens F.38, the
Typst migration.

TODAY IS REFERENCE CAPTURE AND A SPIKE ONLY. Do not author a production
template. Do not touch the render-pdf consumer. Do not remove Chromium.
If you find yourself editing apps/workers/src/jobs/render-pdf.ts, stop.

PRELIMINARY:
P.1. Read CLAUDE.md, docs/PDF_PIPELINE.md, ADR-013 in DECISIONS.md,
     docs/STAGE_F_BUILD_v3.md section 5, and DEV.37 (why "Page X of Y" fell
     back to Chromium's footerTemplate) and DEV.70 (state names displayed,
     codes stored).
P.2. Branch off main. Run the verifier before opening any PR (BUILD_PROMPT
     _TEMPLATE C7a).

==========================================================
PHASE 1 — Capture the diff target
==========================================================
1.1. Render reference PDFs from the CURRENT Chromium pipeline for all four
     paths: quotation, performa invoice, payment receipt, dispatch note.
1.2. For each path, capture a matrix — these are the cases that break
     renderers:
     a. intra-state (CGST + SGST) and inter-state (IGST)
     b. a tenant with custom branding (logo, bank details) and one without
     c. a single-line document and a multi-page one
     d. THE HARD CASE: a dispatch note or invoice carrying a long serial list.
        Their client's real invoice lists 26 serials under one line item;
        capture at 26 and again at 500. Page-break behaviour on a long serial
        list is the highest-risk layout in the whole set.
     e. a document whose total requires round-off
1.3. Commit these to docs/pdf-references/ with a README stating exactly which
     seed data and commit produced each one, so they are reproducible.
1.4. Record for each: page count, file size, and the rendered text of the
     tax summary block and totals. Those values are the acceptance target for
     Day 26, independent of pixel layout.

==========================================================
PHASE 2 — Typst spike (throwaway, do not keep)
==========================================================
Prove the three things most likely to block, before authoring anything real.
2.1. Rupee. Render "₹1,23,456.00" and confirm U+20B9 appears correctly AND
     survives text extraction from the output PDF. This is the exact failure
     that disqualified react-pdf; verify Typst does not share it.
2.2. Page numbering. Render "Page X of Y" using counter(page) across a
     forced 3-page document. DEV.37 records that Chromium's footerTemplate was
     a fallback because it was the only mechanism available; confirm Typst
     removes that constraint.
2.3. Determinism. Render the SAME input twice and diff the bytes. Report
     whether output is byte-identical. If it is NOT — a creation timestamp in
     the metadata is the usual culprit — report what differs and whether it
     can be pinned. THIS IS THE LOAD-BEARING CLAIM of the whole migration.
     If byte-stability is unobtainable, tell me before Day 26 starts, because
     the case for Typst over react-pdf rests on it.
2.4. Long serial list. Render 500 serials in a table cell and report the page
     break behaviour.
2.5. Report install footprint: how Typst is invoked from Node, binary size,
     and how it will be provisioned in the devcontainer, on GitHub runners,
     and in the DO workers image. If any of the three is awkward, say so now.

==========================================================
PHASE 3 — Report and stop
==========================================================
3.1. Write docs/TYPST_SPIKE.md with each spike result, pass or fail, and any
     constraint discovered.
3.2. Do NOT proceed to template authoring. Day 26 is written against what
     this spike finds.

GUARDRAILS
- No production template work. No changes to the render pipeline.
- Do not delete anything Chromium-related today.
- packages/tax is untouched. This is a rendering change; no number that
  appears on a document may change at any point in F.38.
- If any spike in Phase 2 fails, report it rather than working around it.

WHEN DONE
- Confirm all four paths captured across the full matrix, including 26 and
  500 serials
- State the byte-determinism result explicitly
- State whether ₹ renders and survives extraction
- State the provisioning story for all three environments
- Tell me Day 25 is complete and I will write Day 26 against the spike
```

---

## Day 26 — Author the four templates

Written after Day 25's spike. Outline:

- Re-author quotation, PI, payment receipt, dispatch note in Typst
- Preserve: the rich branded body header (DEV.37 keeps this in the body, not
  in a page mechanism), per-page footer with page number and document id, INR
  formatting, state **names** displayed with codes stored (DEV.70), the GST
  breakdown layout, and the round-off line
- Render side by side against Day 25's references
- **Ends with an operator sign-off gate.** You review the visual diff and
  approve before any cutover. Do not merge Day 26 into a cutover.

---

## Day 27 — Cutover

- Replace the `render-pdf` queue consumer with in-process Typst rendering
- Delete the Chromium Dockerfile; `apps/workers` reverts to a plain Node image
- Remove `puppeteer` and `@sparticuz/chromium`; **this closes DEV.89** (the
  arm64/x86-64 binary divergence) and removes the CI Chromium diagnostic and
  its R22 standing rule, which become moot
- Add snapshot tests for all four documents against the Day 25 references —
  the capability that justified this choice
- Raise or remove the worker memory ceiling that DEV.67's OOM forced
- Write the ADR superseding ADR-013. **Supersede, do not delete.** Update
  `docs/PDF_PIPELINE.md`
- Keep pg-boss. Only the PDF job changes shape
- `section 5.6` of the original work order proposed collapsing `apps/workers`
  into the web app once rendering is in-process. Correct, and a **separate
  item** — do not bundle it

---

## Watch items across all three days

| Risk                                            | Why it matters here                                                                                                                         |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Typst binary provisioning in three environments | Devcontainer is arm64, runners and DO are x86-64. This is the same axis DEV.89 lives on — do not replace one binary divergence with another |
| Byte-determinism not achieved                   | The entire case for Typst over react-pdf rests on it. Surfaces Day 25, not Day 27                                                           |
| 500-serial pagination                           | The hardest layout in the set, and their client's real invoices carry serial lists                                                          |
| Visual regression on branded tenants            | Logo, bank details, footer. Covered by the Day 25 matrix and the Day 26 sign-off gate                                                       |
| Scope creep into `packages/tax`                 | No number on any document may change. This is rendering only                                                                                |
