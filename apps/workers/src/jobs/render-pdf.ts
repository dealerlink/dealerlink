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
import {
  buildViewModel,
  filenameFor,
  isRenderableKind,
  logoSvgFrom,
  RENDERABLE_KINDS,
  TEMPLATE_FOR,
  type RenderableKind,
} from '../pdf/view-model';
import { loadDispatchNotePdfData } from '../templates/dispatch-note';
import { loadInvoicePdfData } from '../templates/invoice';
import { loadPaymentReceiptPdfData } from '../templates/payment-receipt';
import { loadPerformaInvoicePdfData } from '../templates/performa-invoice';
import { loadQuotationPdfData } from '../templates/quotation';

/**
 * What a render job may ASK FOR — the queue payload boundary.
 *
 * Wider than `RenderableKind` (what the renderer can PRODUCE) on purpose, and the
 * gap between them is now CHECKED rather than remembered (F.153, F6 D-6). See
 * `RENDERABLE_KINDS` in `../pdf/view-model` for the argument that these are two
 * genuinely different sets.
 */
export type RenderableDocumentType =
  | 'quotation'
  | 'performa_invoice'
  | 'invoice'
  | 'dispatch'
  | 'payment_receipt';

/**
 * Payload types the renderer cannot yet produce — the complement of
 * `RenderableKind` within `RenderableDocumentType`, stated explicitly so it is a
 * declaration rather than an oversight.
 *
 * When a type is implemented it moves from here into `RENDERABLE_KINDS`, and the
 * two assertions below will not compile until both sides agree.
 */
export const NOT_IMPLEMENTED_DOCUMENT_TYPES = [] as const;
export type NotImplementedDocumentType = (typeof NOT_IMPLEMENTED_DOCUMENT_TYPES)[number];

/**
 * THE CHECK F.153 ASKED FOR, in both directions. Neither line does anything at
 * runtime; both fail `typecheck` the moment the two unions stop agreeing.
 *
 *  - The renderer must not claim a kind the payload cannot express.
 *  - Every payload type must be either renderable or explicitly declared
 *    not-implemented. Add an arm to `RenderableDocumentType` and forget both lists,
 *    and the second line stops compiling.
 */
type Assert<T extends true> = T;
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type _RenderableKindsAreDocumentTypes = Assert<
  Equals<Exclude<RenderableKind, RenderableDocumentType>, never>
>;
export type _EveryDocumentTypeIsAccountedFor = Assert<
  Equals<Exclude<RenderableDocumentType, RenderableKind | NotImplementedDocumentType>, never>
>;
/**
 * AND THE TWO LISTS MUST BE DISJOINT — a type cannot be both renderable and
 * declared not-implemented.
 *
 * This assertion was MISSING and was found by F.6's A.7: moving `'invoice'` into
 * `RENDERABLE_KINDS` left it in `NOT_IMPLEMENTED_DOCUMENT_TYPES` as well, and
 * everything still compiled — the `Exclude` above is satisfied by membership in
 * EITHER list, so a type in both is invisible to it. A contradictory declaration
 * that type-checks is exactly the state F.153 was filed about.
 */
export type _ListsAreDisjoint = Assert<
  Equals<Extract<RenderableKind, NotImplementedDocumentType>, never>
>;

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
  // DERIVED from RENDERABLE_KINDS, not restated. This was a hand-written negative
  // allow-list of four types, so 'invoice' threw BY OMISSION — which is how the two
  // unions drifted apart without anything noticing (F.153). Now implementing a type
  // means adding it to one list, and the guard follows.
  if (!isRenderableKind(payload.documentType)) {
    throw new Error(
      `render-pdf: documentType "${payload.documentType}" is not implemented yet. ` +
        `Renderable: ${RENDERABLE_KINDS.join(', ')}. ` +
        `Declared not-implemented: ${NOT_IMPLEMENTED_DOCUMENT_TYPES.join(', ')}.`,
    );
  }
  const documentType: RenderableKind = payload.documentType;

  return withTenant(
    payload.tenantId,
    async (tx) => {
      // A RECORD, NOT A TERNARY CHAIN, and that is a correction with teeth.
      //
      // This was `type === 'quotation' ? … : type === 'performa_invoice' ? … :
      // type === 'dispatch' ? … : loadPaymentReceiptPdfData(…)` — a chain whose
      // final ELSE silently absorbed every type it did not name. Adding 'invoice'
      // to RENDERABLE_KINDS would therefore have loaded an INVOICE WITH THE PAYMENT
      // RECEIPT LOADER: no error, no warning, a rendered PDF with the wrong fields.
      //
      // The compile-time exhaustiveness added for the two render unions did NOT
      // catch it, because a trailing else is not a missing case. `Record<
      // RenderableKind, …>` is, so a new kind without a loader is now a compile
      // error here — the same mechanism that already protects TEMPLATE_FOR.
      // The four existing loaders return four DIFFERENT data shapes, so the record
      // is typed on the call signature rather than on one loader's type.
      type PdfData =
        | Awaited<ReturnType<typeof loadQuotationPdfData>>
        | Awaited<ReturnType<typeof loadPerformaInvoicePdfData>>
        | Awaited<ReturnType<typeof loadDispatchNotePdfData>>
        | Awaited<ReturnType<typeof loadPaymentReceiptPdfData>>
        | Awaited<ReturnType<typeof loadInvoicePdfData>>;
      type PdfLoader = (
        tx: Parameters<typeof loadQuotationPdfData>[0],
        tenantId: string,
        documentId: string,
      ) => Promise<PdfData>;
      const LOADERS: Record<RenderableKind, PdfLoader> = {
        quotation: loadQuotationPdfData,
        performa_invoice: loadPerformaInvoicePdfData,
        dispatch: loadDispatchNotePdfData,
        payment_receipt: loadPaymentReceiptPdfData,
        invoice: loadInvoicePdfData,
      };
      const data = await LOADERS[documentType](tx, payload.tenantId, payload.documentId);

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
