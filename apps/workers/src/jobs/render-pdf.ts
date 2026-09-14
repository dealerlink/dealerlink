/**
 * `render-pdf` — the PDF generation job.
 *
 * Day 10 implements `documentType: 'quotation'`. The other document types
 * are declared (so the queue contract and the `generated_documents` enum are
 * stable) but throw until their templates ship in later days.
 *
 * Two invocation paths share `runRenderPdf`:
 *   - pg-boss handler  — `handleRenderPdfJob`, registered once pg-boss is
 *     bootstrapped (Day 14). Written now so Day 14 is a wiring change only.
 *   - one-shot CLI     — `src/pdf/render-cli.ts`, spawned synchronously by
 *     the web `generateQuotationPdf` Server Action (DEV.36).
 *
 * DAY 27: rendering is now IN-PROCESS TYPST. pg-boss, the queue, the job
 * contract and `generated_documents` are unchanged — only the bytes' origin
 * changed. Chromium, Puppeteer and the HTML templates are gone.
 *
 * The CLI path survives for the web Server Action, but its original reason no
 * longer applies: it existed to keep Puppeteer out of the web build (Day 10
 * guardrail, DEV.36). Typst is a subprocess invocation with no Node dependency
 * to leak, so collapsing that path is now possible — and is deliberately NOT
 * done here, because it is a change to the web action's contract and belongs
 * with the apps/workers consolidation item, not with the cutover.
 */
import { withTenant } from '@dealerlink/db';

import { resolveGeneratedAt } from '../pdf/generated-at';
import { storeRenderedPdf } from '../pdf/store';
import { renderTypstPdf } from '../pdf/typst';
import { buildViewModel, filenameFor, logoSvgFrom, TEMPLATE_FOR } from '../pdf/view-model';
import { loadDispatchNotePdfData } from '../templates/dispatch-note';
import { loadPaymentReceiptPdfData } from '../templates/payment-receipt';
import { loadPerformaInvoicePdfData } from '../templates/performa-invoice';
import { loadQuotationPdfData } from '../templates/quotation';

export type RenderableDocumentType =
  | 'quotation'
  | 'performa_invoice'
  | 'invoice'
  | 'dispatch'
  | 'payment_receipt';

export interface RenderPdfPayload {
  documentType: RenderableDocumentType;
  /** Id of the source document — re-loaded inside the job to avoid stale data. */
  documentId: string;
  tenantId: string;
  /** Acting user id — written to generated_documents.generatedBy + audit. */
  userId: string | null;
}

export interface RenderPdfResult {
  /** New `generated_documents` row id. */
  generatedDocumentId: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Render a document to PDF and persist it. The job re-loads the source
 * document by id (never trusts a payload snapshot) so the PDF always
 * reflects committed data.
 */
export async function runRenderPdf(payload: RenderPdfPayload): Promise<RenderPdfResult> {
  if (
    payload.documentType !== 'quotation' &&
    payload.documentType !== 'performa_invoice' &&
    payload.documentType !== 'payment_receipt' &&
    payload.documentType !== 'dispatch'
  ) {
    throw new Error(
      `render-pdf: documentType "${payload.documentType}" is not implemented yet ` +
        '(Day 10 ships quotation; Day 11 adds performa_invoice; Day 12 adds ' +
        'payment_receipt; Day 13 adds dispatch).',
    );
  }
  const documentType = payload.documentType;

  return withTenant(
    payload.tenantId,
    async (tx) => {
      const data =
        documentType === 'quotation'
          ? await loadQuotationPdfData(tx, payload.tenantId, payload.documentId)
          : documentType === 'performa_invoice'
            ? await loadPerformaInvoicePdfData(tx, payload.tenantId, payload.documentId)
            : documentType === 'dispatch'
              ? await loadDispatchNotePdfData(tx, payload.tenantId, payload.documentId)
              : await loadPaymentReceiptPdfData(tx, payload.tenantId, payload.documentId);

      // The loaders still set `generatedAt: new Date()`. Overridden with the
      // document-keyed value so the footer does not claim a PDF was generated
      // whenever it was last fetched, and so the same document always renders to
      // the same bytes. This is F.66's requirement that the RENDERER own the
      // value rather than a harness or an env var: if it were pinned only in
      // tests, the snapshots would prove a property production does not have.
      data.generatedAt = await resolveGeneratedAt(
        tx as unknown as { execute: (q: unknown) => Promise<unknown> },
        documentType,
        payload.documentId,
      );

      const filename = filenameFor(documentType, data);
      const buffer = renderTypstPdf({
        template: TEMPLATE_FOR[documentType],
        data: buildViewModel(documentType, data),
        generatedAt: data.generatedAt,
        logoSvg: logoSvgFrom(data),
      });
      const stored = await storeRenderedPdf({
        tx,
        tenantId: payload.tenantId,
        documentType,
        documentId: payload.documentId,
        filename,
        buffer,
        generatedBy: payload.userId,
      });
      return {
        generatedDocumentId: stored.id,
        filename: stored.filename,
        sizeBytes: stored.sizeBytes,
      };
    },
    { userId: payload.userId },
  );
}

/** pg-boss handler shape — registered against the `render-pdf` queue in Day 14. */
export async function handleRenderPdfJob(job: {
  data: RenderPdfPayload;
}): Promise<RenderPdfResult> {
  return runRenderPdf(job.data);
}
