/**
 * F.6 — the tax invoice renders, and its ROUND-OFF ROW carries the right SIGNED
 * value.
 *
 * ## PRESENCE IS NOT ENOUGH, AND THAT IS THE WHOLE POINT
 *
 * A row rendering `0.40` and a row rendering `-0.40` are **different documents**,
 * and a presence assertion cannot tell them apart. `round_off` is a signed column
 * precisely so a downward rounding is representable, so the negative case is the one
 * the column exists for — and the one nobody would think to check. All three
 * fixtures are therefore asserted on their VALUE:
 *
 *   INV-2026-0001  round_off  +0.40   row present, positive
 *   INV-2026-0022  round_off  −0.25   row present, NEGATIVE
 *   INV-2026-0002  round_off   0.00   row ABSENT (F6_SPEC §2's suppression)
 *
 * ## BOTH BRANCHES, BECAUSE A CONDITIONAL ROW PASSES WITHOUT RUNNING
 *
 * The row is conditional on `roundOff != none`. A test that only ever rendered a
 * non-zero invoice would pass identically if the condition were `true`, and one that
 * only rendered the zero case would pass if it were `false`. Both are asserted, on
 * the same template, so neither constant satisfies the pair.
 *
 * No golden file and no matrix entry, for the reason `three-percent-render.test.ts`
 * states: `pdf-snapshots.test.ts` reads a Chromium reference for EVERY case in the
 * matrix, those references cannot be regenerated (F.83's one-way door), and adding a
 * case without one throws on `readFileSync`. This asserts on extracted TEXT through
 * the production chain instead.
 */
import { withTenant } from '@dealerlink/db';
import { describe, expect, it } from 'vitest';

import { resolveDocument } from '../scripts/resolve-document';
import { resolveGeneratedAt } from '../src/pdf/generated-at';
import { renderTypstPdf } from '../src/pdf/typst';
import { buildViewModel, logoSvgFrom, TEMPLATE_FOR } from '../src/pdf/view-model';
import { loadInvoicePdfData } from '../src/templates/invoice';

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }>;
  }>;
}

/** Extraction identical to `pdf-snapshots.test.ts`, whitespace squash included. */
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
      if (s && 842 - item.transform[5]! <= 800) body.push(s);
    }
  }
  return body.join('').replace(/\s+/g, '');
}

/** The production chain, the same one the render job drives. */
async function renderInvoice(documentNumber: string): Promise<string> {
  const { tenantId, documentId } = await resolveDocument({
    type: 'invoice',
    tenantSlug: 'demo',
    documentNumber,
  });
  const bytes = await withTenant(tenantId, async (tx) => {
    const data = (await loadInvoicePdfData(tx, tenantId, documentId)) as unknown as Record<
      string,
      unknown
    >;
    data['generatedAt'] = await resolveGeneratedAt(
      tx as unknown as { execute: (q: unknown) => Promise<unknown> },
      'invoice',
      documentId,
    );
    (data['billFrom'] as Record<string, unknown>)['logoUrl'] = null;
    return renderTypstPdf({
      template: TEMPLATE_FOR.invoice,
      data: buildViewModel('invoice', data),
      generatedAt: data['generatedAt'] as Date,
      logoSvg: logoSvgFrom(data),
    });
  });
  return extractBody(bytes);
}

describe('F.6 — the tax invoice renders its signed round-off', () => {
  it('renders at all, and says TAX INVOICE rather than just Invoice', async () => {
    const body = await renderInvoice('INV-2026-0001');
    expect(body).toContain('TAXINVOICE');
    expect(body).toContain('INV-2026-0001');
  }, 60_000);

  it('a POSITIVE round-off renders the row with its value', async () => {
    const body = await renderInvoice('INV-2026-0001');
    expect(body).toContain('RoundOff');
    // THE VALUE, not just the label. 46,634.00 − (39,520.00 + 7,113.60) = 0.40.
    expect(body).toContain('RoundOff0.40');
    // And the whole-rupee total is what the document states.
    expect(body).toContain('46,634.00');
  }, 60_000);

  it('a NEGATIVE round-off renders the row WITH ITS MINUS SIGN', async () => {
    const body = await renderInvoice('INV-2026-0022');
    expect(body).toContain('RoundOff');
    // The case the signed column exists for. 207,813.00 − (189,325.00 + 18,488.25)
    // = −0.25. A presence assertion could not distinguish this from +0.25, and a
    // formatter that dropped the sign would render a document overstating the total
    // by half a rupee while looking entirely correct.
    expect(body).toMatch(/RoundOff-0\.25|RoundOff−0\.25|RoundOff\(0\.25\)/);
    // LAKH GROUPING, not a thousands separator: `Intl.NumberFormat('en-IN')` renders
    // 207813 as 2,07,813.00. The first version of this assertion expected
    // '207,813.00' and failed — the expectation was wrong, not the render, and
    // 46,634.00 above passed only because it is under a lakh and the two
    // conventions agree there.
    expect(body).toContain('2,07,813.00');
  }, 60_000);

  it('a ZERO round-off renders NO ROW — the suppressed branch', async () => {
    const body = await renderInvoice('INV-2026-0002');
    // F6_SPEC §2: the term is always APPLIED and stored; a zero is not PRINTED,
    // because the client's own voucher shows the line only when it carries a figure.
    expect(body).not.toContain('RoundOff');
    // The document still renders, and its total is the (already whole) figure.
    expect(body).toContain('41,418.00');
  }, 60_000);
});
