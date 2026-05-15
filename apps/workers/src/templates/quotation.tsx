/**
 * Quotation PDF template — STUB (chunk 10a).
 *
 * The real React-on-the-server template, its sub-components, and the
 * tenant/dealer data loader land in chunk 10b. This stub exists so the
 * render-pdf job (chunk 10a) typechecks against a stable signature.
 */
import type { DrizzleTx } from '@dealerlink/db';

export interface BuiltQuotationHtml {
  html: string;
  filename: string;
}

export function buildQuotationHtml(
  _tx: DrizzleTx,
  _tenantId: string,
  _documentId: string,
): Promise<BuiltQuotationHtml> {
  return Promise.reject(
    new Error('Quotation template not implemented yet — chunk 10b wires this up.'),
  );
}
