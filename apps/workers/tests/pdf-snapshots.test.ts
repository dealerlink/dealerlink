/**
 * PDF snapshot tests — all four document paths (F.38 Day 27 Phase 4).
 *
 * This is the capability the migration was for. `docs/F38_TYPST_PLAN.md` chose
 * Typst over @react-pdf/renderer partly because byte-stable snapshots were
 * unobtainable there, which would have forced image diffing — "slower, more
 * brittle, and a worse verification story". These tests are that story.
 *
 * TWO BASELINES, AND THEY ANSWER DIFFERENT QUESTIONS:
 *
 *  1. **Typst → Typst (bytes).** The same document renders to the same bytes
 *     twice. This is the determinism claim, and bytes are the only honest way to
 *     state it.
 *  2. **Typst → the Chromium references (text).** `docs/pdf-references/` is a
 *     CONTENT contract captured from the old pipeline immediately before it was
 *     deleted. It cannot be compared byte-wise — Chromium stamps `/CreationDate`
 *     and numbers tagged-PDF nodes from a per-process counter (DEV.125) — so
 *     this compares extracted text.
 *
 * NOTHING IS EXCLUDED FROM THE ASSERTIONS. Not the footer, not the dates. F.67
 * pinned the seed clock and Day 27 made `generatedAt` document-derived precisely
 * so these could be asserted on rather than asserted around. A test that skips
 * the fields most likely to drift is a test that passes while the product breaks.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { withTenant } from '@dealerlink/db';
import { describe, expect, it } from 'vitest';

import { resolveDocument, type DocumentCase } from '../scripts/resolve-document';
import { resolveGeneratedAt } from '../src/pdf/generated-at';
import { renderTypstPdf } from '../src/pdf/typst';
import {
  buildViewModel,
  filenameFor,
  logoSvgFrom,
  TEMPLATE_FOR,
  type RenderableKind,
} from '../src/pdf/view-model';
import { loadDispatchNotePdfData } from '../src/templates/dispatch-note';
import { loadPaymentReceiptPdfData } from '../src/templates/payment-receipt';
import { loadPerformaInvoicePdfData } from '../src/templates/performa-invoice';
import { loadQuotationPdfData } from '../src/templates/quotation';

const REFERENCE_DIR = path.resolve(__dirname, '../../../docs/pdf-references');
const MATRIX = path.resolve(__dirname, '../scripts/typst-matrix.json');
const BRANDED_FIXTURE = path.resolve(__dirname, '../scripts/branded-tenant-fixture.sql');

const loaders = {
  quotation: loadQuotationPdfData,
  performa_invoice: loadPerformaInvoicePdfData,
  payment_receipt: loadPaymentReceiptPdfData,
  dispatch: loadDispatchNotePdfData,
};

const cases: DocumentCase[] = JSON.parse(readFileSync(MATRIX, 'utf8'));

/**
 * The branded cases' logo, read from the fixture SQL rather than from the
 * database. The logo lives in `tenant_settings`, so branded and unbranded need
 * different rows for the same document — supplying it per case renders both
 * without mutating tenant data inside a test.
 */
function fixtureLogo(): string | null {
  return (/'(data:image\/[^']+)'/.exec(readFileSync(BRANDED_FIXTURE, 'utf8')) ?? [])[1] ?? null;
}

async function render(c: DocumentCase): Promise<{ buffer: Buffer; filename: string }> {
  const { tenantId, documentId } = await resolveDocument(c);
  return withTenant(tenantId, async (tx) => {
    const load = loaders[c.type] as (
      tx: unknown,
      t: string,
      d: string,
    ) => Promise<Record<string, unknown>>;
    const data = await load(tx, tenantId, documentId);
    data['generatedAt'] = await resolveGeneratedAt(
      tx as unknown as { execute: (q: unknown) => Promise<unknown> },
      c.type,
      documentId,
    );
    (data['billFrom'] as Record<string, unknown>)['logoUrl'] = c.branded ? fixtureLogo() : null;
    return {
      buffer: renderTypstPdf({
        template: TEMPLATE_FOR[c.type as RenderableKind],
        data: buildViewModel(c.type as RenderableKind, data),
        generatedAt: data['generatedAt'] as Date,
        logoSvg: logoSvgFrom(data),
      }),
      filename: filenameFor(c.type as RenderableKind, data),
    };
  });
}

/** Extracted text, split at the running footer band. */
async function extract(bytes: Buffer): Promise<{ pages: number; body: string; footer: string }> {
  const { getDocument } = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    getDocument: (o: unknown) => { promise: Promise<PdfDoc> };
  };
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const body: string[] = [];
  const footer: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    for (const item of (await page.getTextContent()).items) {
      const s = item.str.trim();
      // A4 is 842pt tall; the running footer sits below 800pt from the top.
      if (s) (842 - item.transform[5] > 800 ? footer : body).push(s);
    }
  }
  const squash = (parts: string[]): string => parts.join('').replace(/\s+/g, '');
  return { pages: doc.numPages, body: squash(body), footer: squash(footer) };
}

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }>;
  }>;
}

describe('PDF snapshots — Typst against the Day 27 reference baseline', () => {
  it.each(cases.map((c) => [c.label, c] as const))(
    '%s matches the reference in text, including the footer and every date',
    async (_label, c) => {
      const { buffer } = await render(c);
      const rendered = await extract(buffer);
      const reference = await extract(readFileSync(path.join(REFERENCE_DIR, `${c.label}.pdf`)));

      expect(rendered.pages).toBe(reference.pages);
      // The footer carries the document id and "Generated <date> IST". Asserted,
      // not skipped — pinning the seed clock is what made that possible.
      expect(rendered.footer).toBe(reference.footer);

      if (c.label === 'dispatch__DSP-REF-0500__500serials') {
        // The one classified difference: Chromium splits the 500 serials
        // 217+283 across two pages and Typst 224+276, so the text differs in
        // ORDER across the page boundary, not in content. Assert the content
        // instead of the concatenation, and assert the split is where it was
        // measured to be — a moving split would be a determinism fault wearing
        // a layout difference's clothes. See docs/TYPST_DIFF.md.
        const serials = (s: string): string[] => s.match(/REF-SN-\d{5}/g) ?? [];
        expect(serials(rendered.body).sort()).toEqual(serials(reference.body).sort());
        expect(serials(rendered.body)).toHaveLength(500);
      } else {
        expect(rendered.body).toBe(reference.body);
      }
    },
  );

  it('renders byte-identically when run twice — the determinism claim', async () => {
    const c = cases.find((x) => x.label === 'quotation__QT-2026-0006__inter__3line')!;
    const [first, second] = [await render(c), await render(c)];
    expect(second.buffer.equals(first.buffer)).toBe(true);
  });

  it('keeps the filenames the Chromium pipeline produced', async () => {
    const quotation = cases.find((x) => x.type === 'quotation')!;
    const dispatch = cases.find((x) => x.type === 'dispatch')!;
    expect((await render(quotation)).filename).toBe(`${quotation.documentNumber}.pdf`);
    expect((await render(dispatch)).filename).toBe(`${dispatch.documentNumber}.pdf`);
  });

  it('embeds ₹ so it survives text extraction — the failure that disqualified react-pdf', async () => {
    const receipt = cases.find((x) => x.type === 'payment_receipt')!;
    const { body } = await extract((await render(receipt)).buffer);
    expect(body).toContain('₹');
  });
});
