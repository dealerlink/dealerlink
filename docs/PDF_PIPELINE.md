# PDF Pipeline

> **Scope:** the Typst render flow, templates, worker job pipeline, storage and
> constraints. Back to [CLAUDE.md](../CLAUDE.md).
>
> **Status:** All four document paths ship — quotation, performa invoice, payment
> receipt, dispatch note. **Rendering is Typst as of Day 27 (ADR-015).** Chromium,
> Puppeteer and the HTML templates' render half are gone; the queue that ADR-013
> established is unchanged.

## Where the code lives

```
apps/workers/src/
  pdf/
    typst.ts         renderTypstPdf() → Buffer. Hermetic: vendored fonts,
                     --ignore-system-fonts, SOURCE_DATE_EPOCH from the document
    view-model.ts    loaded data → the JSON a template reads. All formatting and
                     all derived totals happen here, so a template cannot do
                     arithmetic even by accident
    generated-at.ts  the document-keyed "Generated" instant (created_at first)
    fonts/           Liberation Sans + Mono, vendored. See its README
    store.ts         storeRenderedPdf() → generated_documents row
    render-cli.ts    one-shot CLI: render + persist one document
  jobs/
    render-pdf.ts    runRenderPdf() core + handleRenderPdfJob (pg-boss shape)
  templates-typst/
    _lib/chrome.typ  ALL shared chrome: header band, page footer, party cards,
                     data table, totals block, serial chips, acknowledgment
    quotation.typ, performa-invoice.typ (imports the quotation body),
    payment-receipt.typ, dispatch-note.typ
  templates/
    *.tsx            THE LOADERS ONLY. The React render halves are dead code —
                     the loaders still live in these files, which is why
                     react/react-dom remain dependencies. Extracting them is a
                     separate refactor, deliberately not folded into the cutover
    types.ts         typed template inputs (no `any`)
  lib/
    amount-in-words.ts   Indian-numbering number→words
    format.ts            Indian money/date formatting

apps/web/lib/
  pdf/render-request.ts      web → workers queue bridge (enqueue + poll, DEV.63)
  queue/client.ts            enqueueRenderPdfJob()
  actions/quotations/        generate-pdf, download-pdf, email-pdf
  queries/generated-documents.ts
```

## Render flow (Stage C onwards — DEV.63)

```
Server Action (generate / download / email)
  → requestPdfRender(tx, { documentType, documentId, tenantId, userId })
      → enqueueRenderPdfJob() — boss.send('render-pdf', …)
      → poll generated_documents (on tx) until the new row appears
  ··· (workers process, separate container) ···
  workers: boss.work('render-pdf') → handleRenderPdfJob → runRenderPdf(…)
      → withTenant(tenantId) transaction (RLS + audit context)
      → load<Document>PdfData(): quotation + lines + dealer + tenant
      → resolveGeneratedAt(): the document's own instant, never the clock
      → buildViewModel(): format money/dates, derive column totals
      → renderTypstPdf(): typst compile in a fresh temp dir → Buffer
      → storeRenderedPdf(): insert generated_documents row (COMMIT)
  ← { generatedDocumentId, filename, sizeBytes }
```

Rendering happens in the workers process, per CLAUDE.md §7. The original reason
was a 200 MB Chromium that must not enter the web build; that reason is gone —
Typst is a subprocess with no Node dependency to leak — but the queue isolation
is kept because ADR-013's argument (documents are re-loaded inside the job, RLS
and audit context come from `withTenant`) does not depend on it.

Until DEV.63 the bridge was instead a synchronous `render-cli` **subprocess**
spawned by the web process (DEV.36) — that launched Chromium inside the web
container and broke on DO App Platform (`libnss3` missing). The workers
`render-cli` is retained as a standalone manual-render CLI.

## Templates — one shared chrome, typed inputs

The four Typst templates share `_lib/chrome.typ`, which holds every common
element: the header band, the page footer, party cards, the dark-header data
table, the totals block, the serial chips and the acknowledgment panel. The
performa invoice **imports** the quotation's body rather than copying it. That
sharing is deliberate — the four HTML templates it replaced accumulated their
inconsistencies precisely by being copies.

Sizes and colours are transcribed from the old print stylesheet through a
`px()` helper (`px(n) = n * 0.75pt`), because CSS px and PostScript points are
not the same unit and copying the numbers across unconverted renders everything a
third too large (DEV.120).

**A template cannot do arithmetic.** `view-model.ts` formats every money value
and date into a string before the template sees it, and computes the derived
column totals the old React components used to reduce at render time. By the time
a value reaches a template it is text, so CLAUDE.md's "money is read from stored
columns, never recomputed" is structural rather than a rule to remember.

The data loader recomputes the tax breakdown with the authoritative
`@dealerlink/tax` engine — the Day 9 parity test guarantees this matches the
stored quotation totals.

Three-party support (CLAUDE.md §6): the template accepts `billTo` + an
optional `shipTo`. Quotations are single-party — `shipTo` is null and the
template prints "Ship-To same as Bill-To". Day 11 invoices pass a distinct
`shipTo`.

## Storage — `generated_documents`

Every render inserts one **immutable** `generated_documents` row
(`packages/db/src/schema/generated-document.ts`). Re-generating never
mutates an old row; the download path serves the most-recent row for a
`(documentType, documentId)`.

- `storage = 'inline'` → PDF bytes base64-encoded in `storage_ref`
  (Phase 1 — DEV.16, DO Spaces deferred to Stage D).
- `storage = 'spaces'` → object URL in `storage_ref` (Stage D; the
  `store.ts` `uploadToSpaces` seam is the only file that changes).

Cleanup: `storage = 'inline'` rows older than 30 days are pruned by a daily
cron (wired in Day 14). RLS + the audit trigger apply per the standard
tenant-scoped pattern.

## Typst constraints

- **Binary:** pinned to one version and verified by sha256 per architecture, in
  three places that must agree — `scripts/install-typst.mjs`,
  `apps/workers/Dockerfile` and `.github/workflows/verify.yml`. Resolved at
  render time from `TYPST_BIN` or PATH; there is deliberately no
  download-on-demand, because a renderer that fetches a binary at run time is
  neither hermetic nor auditable.
- **Why the pin is load-bearing:** Typst's layout engine is not contractually
  stable across versions, and the reference baseline in `docs/pdf-references/`
  was captured from the Chromium pipeline immediately before that pipeline was
  deleted. **Those references cannot be regenerated.** A silent upgrade would
  invalidate a baseline nothing can rebuild.
- **Fonts:** vendored in `src/pdf/fonts/` and used with
  `--ignore-system-fonts`. No network in the render path, and identical
  typography on arm64 dev, x86-64 CI and the x86-64 workers image.
- **Render:** A4; 14 mm top / 20 mm bottom / 18 mm sides — the branded header
  lives in the BODY (DEV.37), so the top margin is tighter than the sides.
- **Page footer:** `counter(page)` gives real "Page X of Y". DEV.37 records
  that Chromium could only count pages through `footerTemplate`, which forced
  the running band outside the document; that constraint is gone.
- **Isolation:** each render gets a fresh `mkdtemp` removed in a `finally`.
  Two tenants' documents can be in flight at once and must not see each other's
  data.
- **Determinism:** `SOURCE_DATE_EPOCH` and `--creation-timestamp` are both
  set from the document's own instant. The same document renders to the same
  bytes — asserted in `tests/pdf-snapshots.test.ts` and, across architectures,
  by the `typst-determinism` CI job.

## Performance

Measured on the arm64 devcontainer, ten consecutive renders of the heaviest
document in the corpus (the 500-serial dispatch note):

|                  |                                           |
| ---------------- | ----------------------------------------- |
| Render wall time | 57–125 ms, median 66 ms                   |
| Peak RSS         | 119.6 MB, 11 MB above a 108.5 MB baseline |

For comparison, the Chromium path needed a 60–90 s cold launch, an eager-warm at
boot to hide it (DEV.66), a 45-minute idle-recycle policy, a 100-page recycle as
a memory-leak guard, and a production instance raised to 1 GB after it
OOM-restarted at 512 MB (DEV.67). **None of that machinery exists any more** —
there is no browser to keep alive, so there is no lifecycle to manage.

## Troubleshooting

- _"typst binary not found"_ — run `pnpm typst:install` (pinned + checksum
  verified), or set `TYPST_BIN`. `pnpm typst:check` reports which binary and
  version resolve.
- _"could not unpack the release: `tar -J` needs the xz binary"_ — the
  devcontainer image installs `xz-utils` as of Day 27; a container built before
  that needs a rebuild (F.66).
- _"Could not generate the PDF…"_ / _"taking longer than expected"_ from a
  Server Action — the web process enqueued a `render-pdf` job but no
  `generated_documents` row appeared within `PDF_RENDER_TIMEOUT_MS` (DEV.63).
  Check the workers process is up and consuming (`doctl apps logs <app>
workers --type run` → "Workers process started"); a cold first render can
  exceed the timeout (DEV.66) — retry once warm. To reproduce a render
  off-queue, run the standalone CLI:
  `node --import tsx apps/workers/src/pdf/render-cli.ts --document <id> --tenant <id>`.
- A sample render lives at `docs/samples/quotation-sample.pdf`.
