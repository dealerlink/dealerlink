# F.38 Day 26 — Chromium reference vs Typst render

Every difference between the 14 Day 25 reference PDFs and the Typst renders of
the same 14 documents, classified. **This is the operator sign-off gate**: Day 27
(cutover) does not begin until this list is reviewed.

**Review the artifact, not this file alone.** `docs/typst-comparison/index.html`
places each reference and its Typst render side by side at the same DPI, one
image per page, with the extracted text of both underneath. Open it in a browser
— no PDF viewer and no toolchain needed.

|            |                                                                                        |
| ---------- | -------------------------------------------------------------------------------------- |
| References | `docs/pdf-references/*.pdf` — Chromium 152 (`/usr/bin/chromium`), captured Day 25      |
| Renders    | Typst 0.15.1, `apps/workers/src/templates-typst/`, driven by `scripts/render-typst.ts` |
| Cases      | 14 — all four document paths, branded and unbranded, 1-line through 500 serials        |
| Artifact   | `docs/typst-comparison/index.html`                                                     |

## Result

|                   | Count                           |
| ----------------- | ------------------------------- |
| **INTENTIONAL**   | 6                               |
| **UNINTENTIONAL** | 1 — found after the gate, fixed |
| **UNRESOLVED**    | 1                               |

Both UNRESOLVED items are properties of the **seed data**, not of either
renderer, and neither can be closed by changing a template. They are described in
full below so the gate is decided on them rather than around them.

## What is identical, and how that was established

These are the acceptance targets Day 25 §1.4 set, checked mechanically rather
than by eye:

- **Every money figure on every document.** All 14 renders were text-extracted
  and every `\d[\d,]*\.\d{2}` token compared against the reference's:
  **138 figures across 14 documents, all identical**, including the three-line
  quotation's 23. No number on any document changed, which is F.38's standing
  guardrail.
- **Page counts.** 14/14 match, including the 500-serial case at 2 pages.
- **₹ renders and extracts.** U+20B9 survives extraction at the same count as the
  reference in every case (1 per quotation/PI, 2 per receipt, 0 on the tax-neutral
  dispatch notes, which carry no money).
- **Indian digit grouping at lakh scale.** Verified on real documents, which Day
  25's fixture could not do (it used a literal): `11,70,000.00`, `21,64,500.00`,
  `45,63,343.20` — last group of three, every earlier group of two.
- **"Page X of Y".** Correct on every page of the multi-page case and on every
  single-page document.
- **Branded vs unbranded.** The branded four extract the logo's own text
  (`DEMO SOLAR`); the unbranded ten extract the tenant-name fallback. Same
  document, logo the only delta — the property Day 25 established.
- **State NAMES, not codes** (DEV.70): `Maharashtra`, `Karnataka`, `Gujarat` in
  all 14.
- **Byte-determinism.** Rendering all 14 twice produced 14/14 byte-identical
  PDFs. This is the load-bearing claim of the whole migration and it now holds
  for the real templates, not only Day 25's synthetic fixture.

---

## INTENTIONAL

### 1. `Generated` timestamp is keyed to the DOCUMENT, not to the render

**Reference:** `Generated 11-Sept-2026 23:00 IST` — the wall-clock moment the
reference was captured. **Typst:** `Generated 11-Sept-2026 23:01 IST` for the
seeded documents, `12-Sept-2026 10:59 IST` for the two `DSP-REF-*` fixtures.

The loaders set `generatedAt: new Date()`, so the footer claims a document was
generated whenever it was last rendered. **That is a correctness bug before it is
a determinism one:** a PDF re-fetched three weeks after issue says it was
generated today. `resolveGeneratedAt()` in `render-typst.ts` replaces it with a
value keyed to the document:

1. the earliest `generated_documents.generated_at` row for that document, so the
   first render establishes the value and every later render reproduces it;
2. failing that, the source row's own `created_at`.

If both are absent it **throws** rather than silently falling back to wall-clock.

**(2) is what fires here.** The dev database has no `generated_documents` rows
for these documents — capture deliberately does not write one — so every value
comes from the source row's `created_at`.

Since F.67 Part 2 pinned the seed clock, that `created_at` is itself derived from
the document's own business date, so the footer now reads **the date printed on
the face of the document**: `Quotation QT-2026-0010 · Generated 11-Sept-2026
15:30 IST` on a quotation dated 11-Sept. It is stable across reseeds, and it no
longer contradicts the document it sits under. The reference, by contrast, shows
the wall-clock instant of the Day 25 capture run — 11-Sept-2026 23:00 IST on
every one of the 14, whatever the document is dated.

The label wording is unchanged. **This difference is visible in the footer of
every case in the artifact** and is the one the operator was asked to look at.

### 2. Fonts: Liberation Sans / Liberation Mono, declared rather than inherited

Both the references and the Typst renders set text in **Liberation Sans and
Liberation Mono**. The HTML asks for Inter and IBM Plex Mono over a Google Fonts
`<link>`; neither resolves in any of our environments, so Chromium fell through
its fallback chain to Liberation. **A font difference at this gate would have
been the old pipeline being wrong, not the new one** — so the Typst templates
name Liberation explicitly, and the two now agree by construction rather than by
coincidence.

Consequence worth stating plainly: **neither the references nor these renders
show what production is supposed to look like.** Whether to ship Inter (embed the
font file and drop the network dependency) is a separate decision that F.38 does
not make.

### 3. `px` sizing preserved through a `px()` helper

`styles.ts` is a print stylesheet stated entirely in CSS px. Typst has no px
unit, so `_lib/chrome.typ` defines `px(n) = n * 0.75pt` — the exact CSS ratio
(1px = 1/96in, 1pt = 1/72in) — and every size is written `px(n)` with `n` copied
verbatim from the stylesheet. Sizes therefore match the reference rather than
being re-chosen, and the conversion lives in one place.

### 4. Paragraph spacing set equal to leading

`styles.ts` opens with `* { margin: 0 }` and sets `line-height: 1.45`, so
consecutive blocks — a caps label and the value under it — are separated only by
their own half-leading. Typst has no half-leading and defaults paragraph spacing
to 1.2em. The shell sets `spacing` equal to `leading`, which reproduces CSS's
behaviour; CSS margins that do exist are then explicit `v()` calls.

### 5. Party tiles are height-matched by measurement

`.parties` is a flex row of `flex: 1` tiles, so all three stretch to the tallest.
Typst has no stretch alignment, and `height: 100%` inside an auto-height grid row
resolves against the **page** — which silently turned every one-page document
into three when first tried. `card-row()` measures the bodies at the width they
will actually get, takes the maximum, and gives every card that height.

### 6. The page footer is a page mechanism, not a Chromium `footerTemplate`

DEV.37 records that the running footer had to live outside the document because
`footerTemplate` was the only mechanism Chromium offered for counting pages.
`counter(page)` is native in Typst, so the footer is now part of the document.
Position, wording and typography match the reference. The rich branded header
deliberately stays in the **body**, as DEV.37 intended — moving it would change
first-page geometry.

_(The Day 25/26 prompts cite "DEV.38" for this; the deviation is **DEV.37**.
Already noted in `docs/TYPST_SPIKE.md` §2.2 and repeated here so a reader of this
file alone is not misled.)_

---

## UNINTENTIONAL

### The revision badge — missed at the gate, found afterwards

`Header.tsx:62` renders a `REV n` badge beside the document title when a
quotation's revision is greater than 1. **No Typst template rendered it**, and
the Day 26 report said "0 UNINTENTIONAL" because I did not notice.

Two things made it invisible. Only one of the 14 cases is a revision at all —
QT-2026-0010 is REV 3 — so it appears once in the whole corpus. And **the eye does
not notice an element that is absent**: every side-by-side check asked whether
what was drawn looked right, and nothing was drawn.

It was found by diffing the extracted text of reference against render character
by character, which is a check the artifact does not perform and the reviewer
cannot perform by looking. `QT-2026-0010`'s body text is now character-identical
to its capture — 1085 characters on both sides.

**The lesson is about method, not about a badge:** a visual diff can only find
differences in things that exist in both documents. Missing elements need a
textual comparison, and that comparison should have been part of the gate rather
than something run later while answering a different question.

Everything else found during authoring was fixed rather than classified. For the
record, because several were close calls that would have shipped as "cosmetic"
differences:

| Found                                                                                                                                    | Cause                                                                               | Fix                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Body type ~33% too large; Qty and Unit Price columns collided, rendering `11,700.001,75,500.00`                                          | CSS px values transcribed as Typst pt                                               | the `px()` helper above                                                   |
| Accent, borders and muted text all slightly off                                                                                          | first pass used Tailwind's slate/indigo ramp, not the document's own `:root` tokens | palette re-transcribed from `styles.ts`                                   |
| 500-serial case ran to 3 pages against the reference's 2, with page 1 carrying a line item and no serials                                | the serial run sat inside `box(width: 100%)`, and a box is inline and unbreakable   | serials emitted as paragraph content; chips stay individually unbreakable |
| Dispatch note missing the `Against Order … dated …` line, the `Total units dispatched` row and the whole acknowledgment-of-receipt panel | authored from the reference image before the HTML was read closely                  | all three added from `dispatch-note.tsx`                                  |
| Serials rendered as a dot-separated run instead of bordered chips                                                                        | same                                                                                | `serial-chips()` mirrors `.serial-chip`                                   |
| Footer read `QUOTATION QT-…`                                                                                                             | the heading was reused for the footer label                                         | `footerLabel` supplied per type, matching `buildFooterTemplate()`         |
| Branded logo sat ~33px right of the reference                                                                                            | an explicit 220px width box centred the mark                                        | height-only sizing                                                        |
| Logistics card white instead of tiled; a `LOGISTICS` label the HTML does not have                                                        | transcription slips                                                                 | corrected against the CSS                                                 |
| Every document ran 58–186pt out of position, worst on the 500-serial case                                                                | five separate line-box and box-model differences between CSS and Typst              | see **Residual vertical drift** below                                     |

### Residual vertical drift — measured, not eyeballed

A vertical difference remains and is recorded rather than dropped for looking
cosmetic. Every string appearing exactly once in both a reference and its render
was compared by baseline, so the figures below are worst cases per document, not
a sample:

| Case                                | Strings compared | Worst Δ                     |
| ----------------------------------- | ---------------- | --------------------------- |
| Quotation QT-2026-0006              | 35               | 11.5pt                      |
| Performa invoice PI-2026-0001       | 32               | **16.3pt** — worst anywhere |
| Receipt PAY-2026-0007               | 19               | 12.8pt                      |
| Dispatch DSP-2026-0005              | 25               | 3.5pt                       |
| Dispatch DSP-REF-0500 (500 serials) | 232              | 7.2pt                       |

16.3pt is 5.7mm, at the bank block after a full page of accumulation; the
quotation's line-items `Total` row sits on the reference's baseline exactly. It
started at **186pt**. Five separate causes, each fixed rather than classified,
and each worth naming because the next person will hit them too.

1. **Line advance.** CSS `line-height: 1.45` sets the whole advance; Typst
   advances by `leading` plus the text's extent, and its default extent is
   cap-height-to-baseline (~0.73em). Leading is therefore 0.72em, em-relative —
   an absolute value is wrong at every size but one.
2. **Half-leading inside a cell.** A CSS line box puts half its excess above the
   first line and half below the last; Typst puts nothing outside either. Table
   rows came out ~5pt short each, so the cell inset carries 3px beyond the
   stylesheet's 6px padding to stand in for it.
3. **Paragraph spacing is relative to the paragraph's own em.** At the receipt's
   30px amount that made the shared 0.72em into ~16pt above and below a value
   the stylesheet gives 3px and 4px — 20pt of drift from one card. Spacing is
   zeroed inside that card and the margins written out.
4. **The running footer sat 19.8pt high**, on every page of all 14 documents.
   Typst places the footer 30% of the bottom margin below the content; Chromium's
   band sits closer to the paper edge. `footer-descent` is now 36.8pt, measured
   against a reference footer baseline of 825.6pt from the top of an A4 page.
5. **Serial chips packed 40% tight and 2px narrow.** Chip rows were 7.7pt apart
   against the reference's 13.4pt, and `* { box-sizing: border-box }` makes the
   chip's 1px border part of its width where a Typst stroke adds no layout
   width. Together those fitted eight chips per row instead of seven and put 416
   of the 500 serials on page 1 against the reference's 217 — the same page
   count, a wildly different break. Now: chip pitch 51.76pt against 51.75pt, row
   pitch 13.5pt against 13.4pt, split 224+276 against 217+283.

**One difference is left here and not chased:** the 500-serial page break falls
one chip row later than Chromium's — 224 serials on page 1 rather than 217. A
row of vertical slack, worth seven serials, inside a page that still ends where
the reference's does.

---

## UNRESOLVED

One item, and it is now a question about what Day 27's snapshot tests compare
against rather than about the templates. The two items listed at the Day 26 gate
— the randomised serial fragment, and the references not being reproducible by
document id — have both been fixed at the source (F.67; DEV.119, DEV.121,
DEV.122). What survives is the consequence.

### The Day 25 captures cannot be the snapshot baseline

**They do survive as the visual sign-off record and as a content contract.**
After the seed clock was pinned, a freshly seeded database renders:

| Compared against the Day 25 capture | Result                                               |
| ----------------------------------- | ---------------------------------------------------- |
| Money figures                       | **138/138 identical**                                |
| Document numbers                    | **0/14 differ**                                      |
| Dates on the face of the document   | **0/14 differ** — verified per text item by position |
| Body text, character for character  | **11/14 identical**                                  |
| Running footer                      | **0/14 identical**                                   |

And the same 14 documents rendered from **two independent full reseeds** are
**14/14 byte-identical** — the property Day 27 needs, and one that did not hold
before this work.

The three body differences, each traced to its cause:

| Case                                              | Difference                                             | Why it cannot be closed here                                                                               |
| ------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `dispatch__DSP-2026-0005` (branded and unbranded) | `DSP13-0d0f-0019` vs `DSP13-demo-0019`                 | The capture's fragment came from a tenant uuid that no longer exists. No seed can reproduce it.            |
| `dispatch__DSP-REF-0500`                          | The same 500 serials, split 224+276 instead of 217+283 | The page break falls one chip row later. The text is identical; its order across the page boundary is not. |

The footer differs on all 14 by design: the reference shows the wall-clock
instant of the capture run — 23:00 IST on every document, whatever it is dated —
where the render shows the document's own date. That is INTENTIONAL item 1,
approved at the Day 26 gate.

**So: re-capture at Day 27.** The captures stay as the visual sign-off record,
which is what they were commissioned as, and the snapshot baseline is re-captured
against the pinned seed from the same Chromium pipeline, before the cutover
removes it. Two reasons this is the right way round rather than a concession:

- A baseline that disagrees with a correct render in two fields teaches the next
  reader to expect failures, and a suite with expected failures is not a suite.
- Re-capture is cheap **now** and was not an option on Day 25: the harness
  resolves by document number rather than uuid, the seed is deterministic, and
  `capture-references.ts` shares that resolver — so a re-capture is one command
  and produces a corpus a byte-comparison can hold to.

Re-capturing here is a deliberate, operator-directed act, not a diff being tidied
away. The F.38 guardrail forbids re-recording a reference **to make a diff look
better**; this is re-recording because the inputs were deliberately made
reproducible. The existing corpus is preserved in git history either way.

## Notes for Day 27

- File size: Typst averages **81 KB** against Chromium's **217 KB** — about 37%.
- The round-off line is **not** implemented, per Phase 3. `totals-block()` in
  `_lib/chrome.typ` documents where it is inserted when F.6 builds it; nothing
  else in the block moves.
- No multi-rate GST block and no HSN/SAC table — F.3 and F.4, deliberately not
  built ahead of them.
- `render-pdf.ts`, the queue consumer, Chromium, Puppeteer, `@sparticuz/chromium`
  and `packages/tax` are untouched.
- `resolveGeneratedAt()` lives in the render script, not in the loaders, because
  the loaders are shared with the HTML path and Day 26 must not change it. Day 27
  moves it into the renderer proper — **F.66**.
