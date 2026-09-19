/**
 * F.84 — a 3% document renders, and its tax block carries the rate and its half.
 *
 * WHY THIS TEST EXISTS AND WHY IT IS NOT A SNAPSHOT. F.55 deleted the two
 * `toGstRate` read gates that would have thrown on a rate absent from a
 * hardcoded list, so a 3% document *should* render. Deleting a gate is not the
 * same as demonstrating the path works at a rate that never flowed through it —
 * `docs/GST_RATE_MODEL_AUDIT.md` §3.4 established that everything downstream of
 * those gates is rate-agnostic BY READING rather than by execution. This executes
 * it.
 *
 * NO GOLDEN FILE AND NO MATRIX ENTRY, deliberately.
 * `pdf-snapshots.test.ts` reads a reference PDF for EVERY case in
 * `scripts/typst-matrix.json`, so adding a case without a reference throws on
 * `readFileSync`. Those 14 references are Chromium output forming a
 * cross-renderer contract, the Chromium pipeline that produced them is gone
 * (F.83), and F.81's ruling assigns the first Typst golden file to F.4. So this
 * asserts on extracted TEXT through the production chain instead.
 *
 * ── THE DOCUMENT IS ADDRESSED BY NUMBER, AND THAT IS A DECISION (D-3) ────────
 *
 * `resolveDocument` is the shared addressing the 14 reference cases use, and
 * `scripts/resolve-document.ts` argues in its own header that capture and render
 * must not drift into two ways of naming the same document. The objection to
 * using it here is that a document number is a function of how many documents
 * precede it, so a later seed addition could silently re-point this test.
 *
 * What makes it safe is the seed's ordering discipline, not luck:
 * `packages/db/src/seeds/multi-rate.ts` appends F.84's chains STRICTLY AFTER
 * Chain B and says so in a comment naming every pinned number it protects. The
 * same discipline is what keeps the 14 references addressable. If a future chain
 * is inserted above that point, this test and the matrix re-point together — and
 * that is the correct coupling, because they would both be wrong for the same
 * reason.
 *
 * ── WHAT THE ASSERTED STRINGS DEPEND ON ─────────────────────────────────────
 *
 * The half-rate label exists ONLY on a single-rate, intra-state document:
 * `templates/quotation.tsx` sets `gstRateLabel` to null when a document carries
 * more than one rate, `pdf/view-model.ts` then renders `halfRateLabel` as an
 * empty string, and only the intra-state branch of
 * `templates-typst/quotation.typ` emits a half at all — inter-state prints the
 * full rate as IGST. QT-2026-0018 is single-rate and intra-state for exactly
 * that reason, and `multi-rate-corpus.test.ts` asserts both properties so a
 * fixture regression fails there rather than looking like a renderer bug here.
 */
import { withTenant } from '@dealerlink/db';
import { describe, expect, it } from 'vitest';

import { resolveDocument } from '../scripts/resolve-document';
import { resolveGeneratedAt } from '../src/pdf/generated-at';
import { renderTypstPdf } from '../src/pdf/typst';
import { buildViewModel, logoSvgFrom, TEMPLATE_FOR } from '../src/pdf/view-model';
import { loadQuotationPdfData } from '../src/templates/quotation';

/** F.84's single-rate 3% quotation. Chain C, appended after Chain B. */
const THREE_PERCENT_QUOTE = 'QT-2026-0018';
/** An existing single-rate 18% quotation, used as the control. */
const EIGHTEEN_PERCENT_QUOTE = 'QT-2026-0001';

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }>;
  }>;
}

/**
 * Extraction matches `pdf-snapshots.test.ts` exactly, including the whitespace
 * squash — so the text to match is `CGST1.5%`, never `CGST 1.5%`. Kept identical
 * on purpose: two extractors that differ in whitespace handling would make the
 * two tests disagree about the same PDF.
 */
async function extractBody(bytes: Buffer): Promise<string> {
  const { getDocument } = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    getDocument: (o: unknown) => { promise: Promise<PdfDoc> };
  };
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const body: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const item of (await page.getTextContent()).items) {
      const s = item.str.trim();
      if (s && 842 - item.transform[5] <= 800) body.push(s);
    }
  }
  return body.join('').replace(/\s+/g, '');
}

/** The production chain, the same one `pdf-snapshots.test.ts` drives. */
async function renderQuotation(documentNumber: string): Promise<Buffer> {
  const { tenantId, documentId } = await resolveDocument({
    type: 'quotation',
    tenantSlug: 'demo',
    documentNumber,
  });
  return withTenant(tenantId, async (tx) => {
    const data = (await loadQuotationPdfData(tx, tenantId, documentId)) as unknown as Record<
      string,
      unknown
    >;
    data['generatedAt'] = await resolveGeneratedAt(
      tx as unknown as { execute: (q: unknown) => Promise<unknown> },
      'quotation',
      documentId,
    );
    (data['billFrom'] as Record<string, unknown>)['logoUrl'] = null;
    return renderTypstPdf({
      template: TEMPLATE_FOR.quotation,
      data: buildViewModel('quotation', data),
      generatedAt: data['generatedAt'] as Date,
      logoSvg: logoSvgFrom(data),
    });
  });
}

describe('F.84 — a 3% quotation renders through the production chain', () => {
  it(`loads ${THREE_PERCENT_QUOTE} without throwing`, async () => {
    // F.89's bare `Error` in the loader is out of scope and stays; the point is
    // that it is not reached for a shape-valid rate.
    await expect(renderQuotation(THREE_PERCENT_QUOTE)).resolves.toBeInstanceOf(Buffer);
  });

  it('prints the per-line rate as 3% and the CGST/SGST half as 1.5%', async () => {
    const body = await extractBody(await renderQuotation(THREE_PERCENT_QUOTE));
    // The per-line rate column: `quotation.typ` prints `str(l.gstRate) + "%"`.
    expect(body, 'per-line rate').toContain('3%');
    // The totals block: intra-state emits `"CGST " + halfRateLabel`, and
    // `view-model.ts` derives the half arithmetically — 3 / 2 = 1.5.
    expect(body, 'CGST half-rate label').toContain('CGST1.5%');
    expect(body, 'SGST half-rate label').toContain('SGST1.5%');
    // Intra-state, so there must be no IGST line at all.
    expect(body, 'no IGST on an intra-state document').not.toContain('IGST');
  });

  it('carries the per-line rounded CGST, not the document-level figure', async () => {
    // 562.39 is the sum of two per-line roundings; 562.38 is what one rounding
    // over the summed taxable would give. The fixture's odd rupee subtotals are
    // chosen so the two differ — see multi-rate.ts's Chain C comment.
    const body = await extractBody(await renderQuotation(THREE_PERCENT_QUOTE));
    expect(body, 'per-line CGST').toContain('562.39');
    expect(body, 'document-level CGST must not appear').not.toContain('562.38');
  });

  it('CONTROL: the same assertion goes red on an 18% document', async () => {
    // A test that asserts a label exists is only evidence if it can fail. An 18%
    // document yields a 9% half, so `CGST1.5%` must be absent — if this passed,
    // the assertion above would be matching something incidental.
    const body = await extractBody(await renderQuotation(EIGHTEEN_PERCENT_QUOTE));
    expect(body, '18% document must not carry a 1.5% half').not.toContain('CGST1.5%');
    expect(body, '18% document carries a 9% half').toContain('CGST9%');
  });
});
