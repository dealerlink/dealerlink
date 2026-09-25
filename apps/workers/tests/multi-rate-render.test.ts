/**
 * F.4 — the multi-rate tax block and the HSN/SAC table, through the production chain.
 *
 * **This is the only evidence in the repository that exercises the multi-rate path at
 * all.** All 14 reference documents in `docs/pdf-references/` are single-rate 18%
 * (measured, 2026-09-24), and that is structural rather than accidental:
 * `packages/db/src/seeds/multi-rate.ts` appends its chains after `day13` precisely so
 * nothing that already exists can pick up those products. So the references cannot
 * demonstrate this feature, and a green `pdf-snapshots.test.ts` after F.4 proves only
 * that nothing else broke.
 *
 * Addressed by document number, the same way `three-percent-render.test.ts` and the 14
 * reference cases are, and safe for the same reason: the seed's append-only chain
 * ordering names every pinned number it protects. If a chain is ever inserted above
 * that point, this test and the matrix re-point together, which is the correct
 * coupling.
 *
 * ## The two documents and why each was chosen
 *
 * **QT-2026-0017 — Chain B, inter-state (MH → RJ), and the reason the HSN table is
 * keyed on the (HSN, rate) PAIR rather than on the HSN.** Its three lines are HSN
 * 85414300 at 18%, HSN 85414300 at 5%, and HSN 85359090 at 18% — so **two distinct HSN
 * codes yield three table rows**. A table keyed on HSN alone could not represent it
 * without either losing a rate or inventing a blended one.
 *
 * **QT-2026-0016 — intra-state (MH → MH), three distinct rates, four lines.** Two of
 * those lines share HSN 85414300 at the same 5%, so they MERGE into one pair row: four
 * lines, three rows. It is also the case that produces six totals-block rows, a
 * CGST/SGST pair per rate, where before F.4 the block printed a single pair labelled
 * `CGST ` with no rate at all.
 *
 * Extraction matches `pdf-snapshots.test.ts` and `three-percent-render.test.ts`
 * exactly, whitespace squash included, so all three agree about the same PDF.
 *
 * ## WHAT PROVES THESE ASSERTIONS DISCRIMINATE — and what does NOT
 *
 * F.4's acceptance criterion 5 says the multi-rate claims must go RED under the
 * pre-change implementation, and that control WAS executed: `pdf/view-model.ts` was
 * reverted to its pre-F.4 state and this file went red.
 *
 * **It proves a WEAKER thing than it looks like it proves, and the difference matters
 * enough to write down.** It went red with a Typst COMPILE FAILURE, not an assertion
 * mismatch, because `quotation.typ` dereferences `data.taxRows` unconditionally and
 * the field was gone. So it establishes that the template cannot run without the new
 * data. **It does not establish that these assertions would catch a WRONG value** — a
 * document that renders but renders the wrong figures is a different failure, and a
 * crash says nothing about it.
 *
 * That guarantee exists, but it comes from elsewhere: A.3's two controls on
 * `pdf-snapshots.test.ts` — breaking the CGST label OUTSIDE the named segment and
 * watching the intra-state snapshots fail, and making the segment name text absent
 * from the page and watching all 8 fail — plus the golden file's two controls in this
 * file, where one paisa in the text and one hex digit in the sha each failed
 * independently. Those are value-level discriminations. Criterion 5 is not.
 *
 * Recorded so that a later reader does not cite criterion 5 as the source of a
 * guarantee it does not supply.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { withTenant } from '@dealerlink/db';
import { describe, expect, it } from 'vitest';

import { resolveDocument } from '../scripts/resolve-document';
import { resolveGeneratedAt } from '../src/pdf/generated-at';
import { renderTypstPdf } from '../src/pdf/typst';
import { buildViewModel, logoSvgFrom, TEMPLATE_FOR } from '../src/pdf/view-model';
import { loadQuotationPdfData } from '../src/templates/quotation';

/** Chain B: two HSN codes, three (HSN, rate) pairs, inter-state. */
const CHAIN_B = 'QT-2026-0017';
/** Three rates, four lines, two of them merging into one pair row. Intra-state. */
const THREE_RATE = 'QT-2026-0016';
/** Single-rate 18% intra-state — the control that must NOT satisfy the multi-rate claims. */
const SINGLE_RATE = 'QT-2026-0001';

interface PdfDoc {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: { str: string; transform: number[] }[] }>;
  }>;
}

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

type HsnTable = { header: string[]; rows: string[][]; total: string[] };
type TaxRow = { label: string; amount: string };

/** The production chain, the same one `pdf-snapshots.test.ts` drives. */
async function render(
  documentNumber: string,
): Promise<{ bytes: Buffer; vm: Record<string, unknown> }> {
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
    const vm = buildViewModel('quotation', data);
    return {
      bytes: renderTypstPdf({
        template: TEMPLATE_FOR.quotation,
        data: vm,
        generatedAt: data['generatedAt'] as Date,
        logoSvg: logoSvgFrom(data),
      }),
      vm,
    };
  });
}

/** Sum a column of formatted money strings in integer paise, as the table itself does. */
function sumMoney(values: string[]): string {
  const paise = values.reduce((t, v) => t + Math.round(Number(v.replace(/,/g, '')) * 100), 0);
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

describe('F.4 — multi-rate tax summary and the HSN/SAC table', () => {
  it('Chain B: two HSN codes yield THREE rows, because the key is the (HSN, rate) pair', async () => {
    const { vm } = await render(CHAIN_B);
    const t = vm['hsnTable'] as HsnTable;

    expect(t.rows).toHaveLength(3);
    expect(new Set(t.rows.map((r) => r[0])).size).toBe(2);
    // Ascending by HSN, then by rate within an HSN.
    expect(t.rows.map((r) => [r[0], r[1]])).toEqual([
      ['85359090', '18%'],
      ['85414300', '5%'],
      ['85414300', '18%'],
    ]);
  });

  it('the TOTAL row equals the sum of the table OWN rows, not the document header', async () => {
    const { vm } = await render(CHAIN_B);
    const t = vm['hsnTable'] as HsnTable;
    // Inter-state layout: HSN, Rate, Taxable, Integrated Rate, Integrated Amt, Total Tax.
    expect(t.total[2]).toBe(sumMoney(t.rows.map((r) => r[2] as string)));
    expect(t.total[4]).toBe(sumMoney(t.rows.map((r) => r[4] as string)));
    expect(t.total[5]).toBe(sumMoney(t.rows.map((r) => r[5] as string)));
    // And it happens to agree with the stored header, which is the point: the two
    // are computed independently, so a disagreement would be visible rather than
    // hidden by sourcing the total from the header.
    expect(t.total[2]).toBe('1,89,325.00');
    expect(t.total[5]).toBe('18,488.25');
  });

  it('inter-state emits one IGST row per rate, at the FULL rate', async () => {
    const { vm } = await render(CHAIN_B);
    expect((vm['taxRows'] as TaxRow[]).map((r) => r.label)).toEqual(['IGST 5%', 'IGST 18%']);
  });

  it('intra-state with three rates emits six rows, each carrying its own rate', async () => {
    const { vm } = await render(THREE_RATE);
    const labels = (vm['taxRows'] as TaxRow[]).map((r) => r.label);
    expect(labels).toEqual(['CGST 2.5%', 'SGST 2.5%', 'CGST 6%', 'SGST 6%', 'CGST 9%', 'SGST 9%']);
    // The defect F.4 removes: before this change a mixed-rate document printed
    // `CGST ` with a trailing space and no rate, because gstRateLabel was null.
    for (const l of labels) expect(l).not.toMatch(/^(CGST|SGST|IGST) $/);
  });

  it('four lines merge to three rows when two share an (HSN, rate) pair', async () => {
    const { vm } = await render(THREE_RATE);
    const t = vm['hsnTable'] as HsnTable;
    expect(t.rows).toHaveLength(3);
    expect(t.total[2]).toBe(sumMoney(t.rows.map((r) => r[2] as string)));
  });

  it('all of it reaches the rendered page, not just the view model', async () => {
    const body = await extractBody((await render(CHAIN_B)).bytes);
    expect(body, 'section label').toContain('HSN/SACSUMMARY');
    expect(body, 'per-rate IGST rows').toContain('IGST5%');
    expect(body, 'per-rate IGST rows').toContain('IGST18%');
    expect(body, 'HSN table totals').toContain('18,488.25');
  });

  it('matches the golden file — text and bytes (D-6)', async () => {
    const dir = path.join(__dirname, 'golden');
    const base = 'quotation__QT-2026-0017__inter__multi-rate';
    const { bytes } = await render(CHAIN_B);

    // Text: reviews as a readable diff, so a reviewer can see which figure moved.
    expect(await extractBody(bytes)).toBe(
      readFileSync(path.join(dir, `${base}.txt`), 'utf8').trim(),
    );
    // Bytes: the guarantee the text cannot make, without committing a binary
    // whose movement nobody can read.
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      readFileSync(path.join(dir, `${base}.sha256`), 'utf8').trim(),
    );
  });

  it('CONTROL — a single-rate document does NOT satisfy the multi-rate claims', async () => {
    const { vm } = await render(SINGLE_RATE);
    const t = vm['hsnTable'] as HsnTable;
    // One rate, one HSN, one row: the assertions above would fail here, which is
    // what makes them non-vacuous on the two documents that do exercise the path.
    expect(t.rows).toHaveLength(1);
    expect(vm['taxRows'] as TaxRow[]).toHaveLength(2);
    expect((vm['taxRows'] as TaxRow[]).map((r) => r.label)).toEqual(['CGST 9%', 'SGST 9%']);
  });
});
