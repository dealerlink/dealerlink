/**
 * HTML-level tests for the quotation template (chunk 10b / 10d).
 *
 * These assert the rendered HTML string — no Puppeteer, no DB. The PDF-level
 * checks live in the Playwright verify spec; here we prove the template
 * renders the right content for the shapes that matter.
 */
import { describe, expect, it } from 'vitest';

import { renderQuotationHtml } from '../src/templates/quotation';
import type { PdfLineItem, QuotationPdfData } from '../src/templates/types';

function makeLine(over: Partial<PdfLineItem> = {}): PdfLineItem {
  return {
    lineNumber: 1,
    sku: 'SOL-540W',
    name: 'Monocrystalline Solar Panel 540W',
    hsnCode: '85414011',
    description: null,
    quantity: 100,
    unitOfMeasure: 'Nos',
    unitPrice: 12_000,
    lineDiscount: 0,
    taxableValue: 1_200_000,
    gstRate: 18,
    gstAmount: 216_000,
    lineTotal: 1_416_000,
    ...over,
  };
}

function makeData(over: Partial<QuotationPdfData> = {}): QuotationPdfData {
  return {
    documentTitle: 'QUOTATION',
    numberLabel: 'Quote No.',
    quoteNumber: 'QT-2026-0001',
    revision: 1,
    quoteDate: '2026-05-15',
    validUntil: '2026-05-30',
    status: 'draft',
    currency: 'INR',
    tenantStateAtIssue: 'MH',
    placeOfSupply: 'KA',
    isInterState: true,
    billFrom: {
      name: 'SunDistro',
      legalName: 'SunDistro Energy Pvt Ltd',
      addressLines: ['12 Industrial Estate', 'Pune, Maharashtra, 411001'],
      gstin: '27ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      logoUrl: null,
    },
    billTo: {
      name: 'Bright Solar',
      legalName: 'Bright Solar Solutions LLP',
      addressLines: ['44 MG Road', 'Bengaluru, Karnataka, 560001'],
      gstin: '29PQRST5678U1Z2',
      contact: 'Ravi Kumar',
    },
    shipTo: null,
    lines: [makeLine()],
    subtotal: 1_200_000,
    discountLabel: null,
    discountAmount: 0,
    taxableAmount: 1_200_000,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 216_000,
    gstRateLabel: '18',
    totalAmount: 1_416_000,
    amountInWords: 'Rupees Fourteen Lakh Sixteen Thousand Only',
    termsAndConditions: 'Payment due within 30 days.',
    bank: {
      name: 'HDFC Bank',
      accountNumber: '50200012345678',
      ifsc: 'HDFC0001234',
      branch: 'Pune Camp',
    },
    generatedAt: new Date('2026-05-15T09:00:00Z'),
    ...over,
  };
}

describe('renderQuotationHtml', () => {
  it('renders a complete HTML document', () => {
    const html = renderQuotationHtml(makeData());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html');
    expect(html).toContain('QUOTATION');
  });

  /**
   * ⚠ ASSERTS ON A PRODUCTION-DEAD RENDERER. See the note on the case below.
   */
  it('multi-line inter-state quotation with discount shows IGST, not CGST/SGST', () => {
    const html = renderQuotationHtml(
      makeData({
        lines: [makeLine(), makeLine({ lineNumber: 2, sku: 'INV-5KW', lineDiscount: 5_000 })],
        discountLabel: '5%',
        discountAmount: 60_000,
        isInterState: true,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 205_200,
      }),
    );
    expect(html).toContain('IGST 18%');
    expect(html).not.toContain('CGST');
    expect(html).toContain('INTER-STATE');
    expect(html).toContain('Discount (5%)');
    expect(html).toContain('INV-5KW');
  });

  /**
   * ⚠ ASSERTS ON A PRODUCTION-DEAD RENDERER — F.3 (day prompt D-7).
   *
   * `renderQuotationHtml` is not on any production path. `jobs/render-pdf.ts:31-34`
   * imports only the four `load*PdfData` loaders and renders through
   * `renderTypstPdf`; the live tax block is
   * `apps/workers/src/templates-typst/quotation.typ:97-110`. This case and the one
   * above are the only two callers of the HTML renderer that assert on tax, and
   * they assert the SINGLE-RATE shape.
   *
   * **They are marked rather than deleted or ported, deliberately.** The
   * behaviour they check is right and the Typst path needs equivalent coverage
   * anyway, so deleting them loses coverage nothing replaces. Porting them is
   * F.4, which is the day that makes the Typst block rate-wise. What F.3 must not
   * do is leave them looking like current coverage in the meantime: a test that
   * cannot fail for the right reason reads as coverage, which is worse than no
   * test.
   *
   * **When F.4 lands, these two cases stop describing what ships.** Port the
   * assertions to the Typst path then, and delete these. Do not delete the HTML
   * path itself in passing — `renderQuotationHtml` and `loadQuotationPdfData` live
   * in the SAME file, `templates/types.ts` is shared with the live loaders, and a
   * second dead renderer is kept alive by `payment-receipt-template.test.ts:10`.
   */
  it('single-line intra-state quotation shows CGST + SGST at half rate', () => {
    const html = renderQuotationHtml(
      makeData({
        placeOfSupply: 'MH',
        isInterState: false,
        cgstAmount: 108_000,
        sgstAmount: 108_000,
        igstAmount: 0,
      }),
    );
    expect(html).toContain('CGST 9%');
    expect(html).toContain('SGST 9%');
    expect(html).not.toContain('IGST 18%');
    expect(html).toContain('INTRA-STATE');
  });

  it('shows the revision badge only for revisions > 1', () => {
    expect(renderQuotationHtml(makeData({ revision: 1 }))).not.toContain('REV 2');
    expect(renderQuotationHtml(makeData({ revision: 2 }))).toContain('REV 2');
  });

  it('renders the tenant name fallback when there is no logo', () => {
    const html = renderQuotationHtml(
      makeData({ billFrom: { ...makeData().billFrom, logoUrl: null } }),
    );
    // The fallback element is present; no <img> element is emitted.
    expect(html).toContain('class="logo-fallback"');
    expect(html).toContain('SunDistro');
    expect(html).not.toContain('<img');
  });

  it('renders an <img> when a logo data URI is present', () => {
    const dataUri = 'data:image/png;base64,iVBORw0KGgo=';
    const html = renderQuotationHtml(
      makeData({ billFrom: { ...makeData().billFrom, logoUrl: dataUri } }),
    );
    expect(html).toContain('<img');
    expect(html).toContain(dataUri);
    // The fallback element is NOT emitted (the CSS rule string still is).
    expect(html).not.toContain('class="logo-fallback"');
  });

  it('omits the bank block when no bank details are configured', () => {
    expect(renderQuotationHtml(makeData({ bank: null }))).not.toContain('Bank Details');
    expect(renderQuotationHtml(makeData())).toContain('Bank Details');
  });

  it('renders the dealer GSTIN, quote number and amount-in-words', () => {
    const html = renderQuotationHtml(makeData());
    expect(html).toContain('QT-2026-0001');
    expect(html).toContain('29PQRST5678U1Z2');
    expect(html).toContain('Rupees Fourteen Lakh Sixteen Thousand Only');
    expect(html).toContain('Ship-To same as Bill-To');
  });
});
