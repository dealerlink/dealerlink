# Day 27 — Re-capture, then cut over to Typst

**Goal:** Fresh references against the pinned seed, in-process Typst rendering,
Chromium gone, snapshot tests live, ADR-013 superseded.

**Estimated time:** 6–8 hours. Split across two days if Phase 1 is slow — the
cutover must not be rushed to fit a day.

---

## The one-way door

Phase 1 captures references **from the Chromium pipeline**. Phase 3 deletes
that pipeline. After Phase 3 the references can never be regenerated.

So Phase 1 completes and is committed before Phase 3 begins, and Phase 2's
comparison runs against the committed captures. If Phase 1 is wrong, the
snapshot baseline is wrong forever and the only recovery is `git revert` on
the Chromium removal.

---

## Prompt for Claude Code

```
You are implementing Day 27 of the Dealerlink build. Day 26 is signed off;
F.67 pinned the seed clock and proved 14/14 byte-identical reproduction across
two independent reseeds.

Today re-captures references and cuts over to Typst.

READ THIS FIRST: Phase 1 captures from the Chromium pipeline that Phase 3
deletes. After Phase 3 those references cannot be regenerated. Phase 1 must be
complete, verified and COMMITTED before Phase 3 starts. Do not interleave them.

PRELIMINARY:
P.1. Read docs/TYPST_DIFF.md, docs/TYPST_SPIKE.md, docs/PDF_PIPELINE.md,
     ADR-013, DEV.37, DEV.67 (the 512MB OOM), DEV.89 (arm64/x86-64 Chromium),
     F.66 and F.67.
P.2. Branch off main. Run the verifier BEFORE opening the PR (C7a).
P.3. Confirm the seed is pinned and reproduces: reseed twice, render, confirm
     14/14 byte-identical. Do not trust the prior report — re-establish it,
     because everything today rests on it.

==========================================================
PHASE 1 — Re-capture from Chromium (the one-way door)
==========================================================
1.1. Seed from scratch against the pinned epoch. Capture all 14 cases from the
     CURRENT Chromium pipeline.
1.2. Verify reproducibility before trusting them: reseed, re-capture, confirm
     14/14 byte-identical to the first capture. A baseline that is not itself
     reproducible is not a baseline.
1.3. Replace docs/pdf-references/ with these. Update the README: captured
     against the pinned seed, addressed by (tenant slug, document number) per
     DEV.119, with the commit and SEED_EPOCH that produced them.
1.4. Keep the Day 25 captures as the SIGN-OFF RECORD in a clearly separate
     directory with a README saying they are historical evidence of operator
     approval, not a test baseline. Do not delete them — they are the record
     that the visual diff was approved.
1.5. COMMIT PHASE 1 ON ITS OWN before proceeding. If Phase 3 later has to be
     reverted, the references must survive the revert.

==========================================================
PHASE 2 — Compare Typst against the new references
==========================================================
2.1. Render all 14 from Typst. Compare against the Phase 1 captures.
2.2. Run BOTH comparisons, and treat the textual one as primary:
     - character-level text diff of extracted content
     - the side-by-side visual artifact
     Day 26's "0 UNINTENTIONAL" was wrong because the REV n badge was absent
     from one side entirely, and a visual diff cannot see an absence. Text
     diff first, visuals second.
2.3. Expect the footer to differ (generatedAt is now document-keyed) and fonts
     to differ (Chromium fetches Google Fonts over the network and Inter falls
     back to Liberation Sans; Typst is hermetic). Both are INTENTIONAL and
     already classified. Anything else is not.
2.4. Update TYPST_DIFF.md. If any UNINTENTIONAL difference appears, STOP and
     report before Phase 3. Do not cut over onto an unexplained difference.

==========================================================
PHASE 3 — Cutover
==========================================================
Only after Phase 1 is committed and Phase 2 is clean.

3.1. Replace the render-pdf queue consumer with in-process Typst rendering.
     KEEP pg-boss and keep the job — only its implementation changes.
3.2. Remove puppeteer and @sparticuz/chromium from the tree. Delete the custom
     Chromium Dockerfile; apps/workers reverts to a plain Node image.
3.3. This CLOSES DEV.89 — the arm64/x86-64 binary divergence that forced
     PUPPETEER_EXECUTABLE_PATH gating. Also remove the CI Chromium diagnostic
     step and the R22 standing rule about it, both of which become moot. Say
     so explicitly in the commit and in DEVIATIONS.
3.4. Remove the Google Fonts network fetch. Renders become hermetic — embed
     the fonts. Note in DEVIATIONS that the old pipeline had a network
     dependency inside every render and would have silently fallen back to
     system fonts if Google were unreachable. That is a defect being removed,
     independent of Typst.
3.5. Raise or remove the worker memory ceiling that DEV.67's OOM forced.
     Report the new peak — Day 25 measured Typst renders at 8-31ms against
     Chromium's seconds, so the ceiling should become irrelevant.
3.6. Typst binary provisioning across all three environments: arm64
     devcontainer, x86-64 CI runners, x86-64 DO workers. F.66 records the xz
     blocker in the devcontainer and that the npm package is abandoned since
     2023. Do not introduce a new binary divergence while removing one —
     verify all three resolve the same statically-linked build from the same
     tag.

==========================================================
PHASE 4 — Snapshot tests
==========================================================
4.1. Add snapshot tests for all four document paths against the Phase 1
     references. This is the capability that justified choosing Typst over
     @react-pdf/renderer; it is the point of the migration, not a nice-to-have.
4.2. Assert on bytes where possible, text content where not. Do NOT exclude
     the footer or the dates from assertions — F.67 pinned the clock precisely
     so they could be asserted on.
4.3. Update the typst-determinism CI check to render a REAL document rather
     than the synthetic fixture (F.66). Day 25's fixture passed while real
     documents failed, because the fixture had no timestamp.
4.4. SOURCE_DATE_EPOCH must be pinned by the RENDERER from the document's own
     data, not by an env var the test harness happens to set. If it is only
     set in tests, production renders are non-deterministic and the snapshot
     proves a property the pipeline lacks.

==========================================================
PHASE 5 — Documentation
==========================================================
5.1. Write the ADR superseding ADR-013. SUPERSEDE, do not delete. Include the
     @react-pdf/renderer rejection and its evidence (issues #3168 and #3047),
     so the decision is reconstructible.
5.2. Update docs/PDF_PIPELINE.md.
5.3. Do NOT collapse apps/workers into apps/web. That is a separate item and
     is correctly filed as such.

GUARDRAILS
- Phase 1 commits before Phase 3 starts. Non-negotiable.
- No number on any document may change. packages/tax untouched.
- Do not implement round-off — that is F.6.
- Do not build the multi-rate block or HSN/SAC table — F.3 and F.4.
- Do not re-capture a reference to make a diff look better.
- Do not delete the Day 25 sign-off record.
- If any UNINTENTIONAL difference appears in Phase 2, stop and report.

WHEN DONE
- Confirm the new references reproduce across two reseeds
- State the Phase 2 diff counts, from the TEXT comparison
- Confirm Chromium, Puppeteer and the custom Dockerfile are gone
- Confirm DEV.89 closed and the CI diagnostic removed
- Report the new worker memory peak
- Confirm Typst resolves identically in all three environments
- Confirm snapshot tests assert on footer and dates, not around them
- Confirm the ADR supersedes rather than replaces ADR-013
```

---

## Verification checklist

- [ ] Phase 1 committed separately, before any Chromium removal
- [ ] New references reproduce byte-identically across two reseeds
- [ ] Day 25 captures preserved as sign-off record, clearly labelled
- [ ] Text diff run as primary, visual as secondary
- [ ] Zero UNINTENTIONAL differences
- [ ] `puppeteer`, `@sparticuz/chromium`, custom Dockerfile all gone
- [ ] DEV.89 closed; CI Chromium diagnostic and R22 rule removed
- [ ] Google Fonts network fetch removed; renders hermetic
- [ ] Worker memory ceiling raised or removed; new peak reported
- [ ] Typst resolves identically on arm64 devcontainer, CI, DO workers
- [ ] Snapshot tests cover all four paths, footer and dates included
- [ ] `typst-determinism` renders a real document
- [ ] `SOURCE_DATE_EPOCH` set by the renderer, not the harness
- [ ] ADR supersedes ADR-013; `PDF_PIPELINE.md` updated
- [ ] `apps/workers` **not** collapsed into `apps/web`
