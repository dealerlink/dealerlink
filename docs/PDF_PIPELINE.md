# PDF Pipeline

> **Scope:** Puppeteer render flow, the quotation template, worker job
> pipeline, storage, and concurrency constraints. Back to [CLAUDE.md](../CLAUDE.md).
>
> **Status:** Day 10 implements the quotation PDF end to end. Invoice,
> dispatch, and payment-receipt documents reuse this pipeline in later days.

## Where the code lives

```
apps/workers/src/
  pdf/
    browser.ts       lazy Chromium singleton (recycle policies)
    render.ts        renderPdfFromHtml(html, opts) → Buffer
    store.ts         storeRenderedPdf() → generated_documents row
    render-cli.ts    one-shot CLI: render + persist one document
  jobs/
    render-pdf.ts    runRenderPdf() core + handleRenderPdfJob (pg-boss shape)
  templates/
    quotation.tsx    QuotationDocument + data loader + buildQuotationHtml
    types.ts         typed template inputs (no `any`)
    styles.ts        inline A4 print CSS
    _components/     Header, PartyBlock, LineItemsTable, TaxSummary, Footer
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
      → buildQuotationHtml(): load quotation + lines + dealer + tenant,
        recompute tax via @dealerlink/tax, render React → HTML string
      → renderPdfFromHtml(): Puppeteer setContent + page.pdf({A4})
      → storeRenderedPdf(): insert generated_documents row (COMMIT)
  ← { generatedDocumentId, filename, sizeBytes }
```

Puppeteer never runs in the web process — the web build must not import
`puppeteer-core` (200 MB Chromium guardrail) and CLAUDE.md §7 forbids
rendering on the web process. Rendering happens entirely in the workers
process, which runs a Chromium-capable Dockerfile (`apps/workers/Dockerfile`).

Until DEV.63 the bridge was instead a synchronous `render-cli` **subprocess**
spawned by the web process (DEV.36) — that launched Chromium inside the web
container and broke on DO App Platform (`libnss3` missing). The workers
`render-cli` is retained as a standalone manual-render CLI.

## Single React component, typed inputs

The `QuotationDocument` template (`templates/quotation.tsx`) is
React-on-the-server: typed props (`QuotationPdfData`, no `any`), rendered
with `renderToStaticMarkup`. Sub-components (`Header`, `PartyBlock`,
`LineItemsTable`, `TaxSummary`, `Footer`) are reused verbatim by Day 11's
invoice template. The data loader recomputes the tax breakdown with the
authoritative `@dealerlink/tax` engine — the Day 9 parity test guarantees
this matches the stored quotation totals.

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

## Puppeteer constraints

- **Browser:** one lazy Chromium singleton, shared across renders.
  - Recycled after **100 pages** (memory-leak guard).
  - Recycled after **45 min idle** (widened from 10 min, DEV.67), and on
    crash/disconnect. Each recycle logs
    `PDF: Chromium recycled — reason: idle|page-cap|crash | uptime: Xm`.
  - In production (Linux container) it uses `@sparticuz/chromium`; on dev
    machines it falls back to a system Chrome/Chromium install (the
    `@sparticuz` binary pack is Linux-only). Override with
    `PUPPETEER_EXECUTABLE_PATH`.
- **Render:** A4, 18 mm margins (14 mm top — the branded header lives in the
  body), `printBackground: true`. 30 s timeout.
- **Page footer:** the running "Page X of Y · document id" band uses
  Chromium's `footerTemplate` (the only mechanism that can count pages —
  see DEV.37). The branded _header_ is body HTML.
- All CSS + fonts are inlined into the HTML — no external stylesheet.

## Cold start + eager-warm (DEV.66)

On the small production worker (`basic-xxs`, 512 MB / shared vCPU) a **cold
Chromium launch is slow** — ~60–90 s. The slow part is the launch itself
(process spawn + DevTools handshake), **not** `@sparticuz/chromium`'s binary
extraction (which is ~3 s). A warm render is ~5 s.

**Cold-start expectation:** the **first render of a session is ~60–90 s**;
**subsequent renders are ~5 s** until the browser is recycled.

Mitigations:

- **Eager-warm at boot.** `apps/workers/src/index.ts` calls `warmChromium()`
  **after** registering pg-boss consumers and **fire-and-forget** (never blocks
  job processing — an early blocking version stalled the worker, DEV.66).
  `warmChromium()` triggers only the binary **extraction** (`executablePath()`),
  not a full launch — a boot-time launch hung on this box. Toggle with
  `PDF_EAGER_WARM=false`.
- **`PDF_RENDER_TIMEOUT_MS`** (web; default 15 s, **staging 120 s**, DEV.67)
  bounds how long the Server Action polls `generated_documents`. 120 s lets the
  cold first render complete within the wait rather than erroring. Revisit for
  production based on real load data.
- **45-min idle-recycle** (DEV.67, was 10 min) so an active session pays the
  cold launch ~once, not every 10 min.
- The UI shows `components/ui/pdf-progress.tsx` during the wait so a slow first
  render never looks frozen.
- **Stage D:** a roomier worker instance makes cold launches fast (and could let
  the timeout drop back). The production worker-sizing decision is deferred to
  Stage D, informed by the recycle-frequency logs + real PDF load from staging
  and the pilot. See DEV.66/67.

## Troubleshooting

- _"No Chromium executable found"_ — install Google Chrome, or set
  `PUPPETEER_EXECUTABLE_PATH` to a Chromium binary.
- _"Could not generate the PDF…"_ / _"taking longer than expected"_ from a
  Server Action — the web process enqueued a `render-pdf` job but no
  `generated_documents` row appeared within `PDF_RENDER_TIMEOUT_MS` (DEV.63).
  Check the workers process is up and consuming (`doctl apps logs <app>
workers --type run` → "Workers process started"); a cold first render can
  exceed the timeout (DEV.66) — retry once warm. To reproduce a render
  off-queue, run the standalone CLI:
  `node --import tsx apps/workers/src/pdf/render-cli.ts --document <id> --tenant <id>`.
- A sample render lives at `docs/samples/quotation-sample.pdf`.
