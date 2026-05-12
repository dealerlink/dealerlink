# PDF Pipeline

> **Scope:** Puppeteer render flow, worker job pipeline, and concurrency constraints. Read this in Day 10 and onward. Back to [CLAUDE.md](../CLAUDE.md).

## Single React component, two render paths

The same `<QuotationDocument />` component (under `apps/web/components/pdf/`) is used for:

1. **Live preview** in the Quotation Builder — rendered as React in an iframe at A4 dimensions (380px scaled width).
2. **Final PDF** — rendered by Puppeteer in the worker process.

This guarantees preview ≡ final, eliminating the entire class of "looks different on PDF" bugs.

## Worker render flow

```
Server Action → enqueue 'render-pdf' job → pg-boss → workers/jobs/render-pdf.ts
  → Puppeteer launches Chromium (warm pool of 1)
  → navigate to /internal/render/quotation/:id (auth via signed token)
  → page.pdf({ format: 'A4', printBackground: true })
  → upload to DO Spaces
  → write document_log row
  → mark job complete
```

## Puppeteer constraints

- Concurrency: **1 render at a time** in Phase 1 (`pg-boss` queue concurrency = 1 for the `render-pdf` channel).
- Restart Chromium every **100 renders** to contain memory leaks.
- Maximum render time: 30 seconds. Fail and retry up to 3 times.
- Always launch with `--no-sandbox --disable-dev-shm-usage` flags for Droplet compatibility.
