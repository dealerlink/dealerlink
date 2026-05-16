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
 *     the web `generateQuotationPdf` Server Action (DEV.36). This keeps
 *     Puppeteer entirely inside the workers process — the web build never
 *     imports puppeteer-core (Day 10 guardrail).
 */
import { withTenant } from '@dealerlink/db';

import { renderPdfFromHtml } from '../pdf/render';
import { storeRenderedPdf } from '../pdf/store';
import { buildPaymentReceiptHtml } from '../templates/payment-receipt';
import { buildPerformaInvoiceHtml } from '../templates/performa-invoice';
import { buildQuotationHtml } from '../templates/quotation';

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
    payload.documentType !== 'payment_receipt'
  ) {
    throw new Error(
      `render-pdf: documentType "${payload.documentType}" is not implemented yet ` +
        '(Day 10 ships quotation; Day 11 adds performa_invoice; Day 12 adds payment_receipt).',
    );
  }
  const documentType = payload.documentType;

  return withTenant(
    payload.tenantId,
    async (tx) => {
      const built =
        documentType === 'quotation'
          ? await buildQuotationHtml(tx, payload.tenantId, payload.documentId)
          : documentType === 'performa_invoice'
            ? await buildPerformaInvoiceHtml(tx, payload.tenantId, payload.documentId)
            : await buildPaymentReceiptHtml(tx, payload.tenantId, payload.documentId);
      const buffer = await renderPdfFromHtml(built.html, {
        format: 'A4',
        margin: { top: '14mm', bottom: '20mm' },
        footerTemplate: built.footerTemplate,
      });
      const stored = await storeRenderedPdf({
        tx,
        tenantId: payload.tenantId,
        documentType,
        documentId: payload.documentId,
        filename: built.filename,
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
