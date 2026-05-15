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
  pdf/spawn-render.ts        web → workers subprocess bridge
  actions/quotations/        generate-pdf, download-pdf, email-pdf
  queries/generated-documents.ts
```

## Render flow (Phase 1 — Day 10)

```
Server Action (generate / download / email)
  → spawnPdfRender()  — spawns the workers render-cli subprocess (DEV.36)
      → render-cli  → runRenderPdf({ documentType, documentId, tenantId })
          → withTenant(tenantId) transaction (RLS + audit context)
          → buildQuotationHtml(): load quotation + lines + dealer + tenant,
            recompute tax via @dealerlink/tax, render React → HTML string
          → renderPdfFromHtml(): Puppeteer setContent + page.pdf({A4})
          → storeRenderedPdf(): insert generated_documents row
  ← { generatedDocumentId, filename, sizeBytes }
```

Puppeteer never runs in the web process — the web build must not import
`puppeteer-core` (200 MB Chromium guardrail). The render-cli subprocess is
the Phase-1 bridge; **Day 14** swaps it for a pg-boss `render-pdf` enqueue
against the already-written `handleRenderPdfJob` (see DEV.36).

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
  - Recycled after **10 min idle**, and on crash/disconnect.
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

## Troubleshooting

- _"No Chromium executable found"_ — install Google Chrome, or set
  `PUPPETEER_EXECUTABLE_PATH` to a Chromium binary.
- _"Could not generate the PDF…"_ from a Server Action — the render-cli
  subprocess failed; run it directly to see the error:
  `node --import tsx apps/workers/src/pdf/render-cli.ts --document <id> --tenant <id>`.
- A sample render lives at `docs/samples/quotation-sample.pdf`.
