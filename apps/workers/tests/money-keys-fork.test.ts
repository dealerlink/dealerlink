/**
 * `MONEY_KEYS` is FORKED (F.108), and a money key missing from either copy is
 * silent. This asserts the two agree.
 *
 * ## WHY A MISSING KEY IS WORSE THAN A CRASH
 *
 * `convert` in both builders formats a number only when its key is in `MONEY_KEYS`;
 * otherwise it falls through to `return value`. So a money field whose key is absent
 * reaches the Typst template as a **raw JSON number** and gains no `…Raw`
 * companion — and **nothing throws, nothing warns**. For `roundOff` that would mean
 * an invoice printing without its round-off row, reconciling against nothing, and
 * looking entirely normal.
 *
 * That is why `roundOff` was added to both copies BEFORE the template was written
 * rather than discovered from a blank row.
 *
 * ## WHY THIS TEST READS SOURCE TEXT
 *
 * `apps/workers/scripts/render-typst.ts` does not export its `MONEY_KEYS`; it is a
 * deliberate fork of the production builder for the byte-measurement harness
 * (F.108), and both files say so. Importing it is not possible, so the two lists are
 * extracted from source and compared. A structural test over a known fork is the
 * only thing that can see a divergence between two copies of a literal — and the
 * fork is exactly what F.108 exists to flag.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

const SOURCES = {
  production: path.join(ROOT, 'src/pdf/view-model.ts'),
  harness: path.join(ROOT, 'scripts/render-typst.ts'),
} as const;

/** Extract the string literals from the `MONEY_KEYS` Set in a source file. */
function moneyKeys(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const start = src.indexOf('MONEY_KEYS = new Set([');
  if (start < 0) throw new Error(`MONEY_KEYS not found in ${file}`);
  const end = src.indexOf(']);', start);
  if (end < 0) throw new Error(`unterminated MONEY_KEYS in ${file}`);
  const body = src.slice(start, end);
  return [...body.matchAll(/'([A-Za-z][A-Za-z0-9]*)'/g)].map((m) => m[1]!);
}

describe('MONEY_KEYS — the two forks must agree', () => {
  it('both copies contain exactly the same keys, in the same order', () => {
    const production = moneyKeys(SOURCES.production);
    const harness = moneyKeys(SOURCES.harness);

    // Order too, not just membership: the two files are maintained by copying, and
    // a reordering is a sign one was edited independently.
    expect(harness).toEqual(production);
    // A sanity floor — if the extractor silently matched nothing, `toEqual` on two
    // empty arrays would pass. This is the control on the instrument.
    expect(production.length).toBeGreaterThan(10);
  });

  it('roundOff is present in BOTH, because its absence would be silent', () => {
    expect(moneyKeys(SOURCES.production)).toContain('roundOff');
    expect(moneyKeys(SOURCES.harness)).toContain('roundOff');
  });

  it('every figure the invoice totals block needs is a money key', () => {
    // Enumerated rather than counted (C6b). These are the seven stored header
    // figures plus the round-off term the invoice adds.
    const required = [
      'subtotal',
      'discountAmount',
      'taxableAmount',
      'cgstAmount',
      'sgstAmount',
      'igstAmount',
      'roundOff',
      'totalAmount',
    ];
    const production = moneyKeys(SOURCES.production);
    for (const key of required) expect(production, `missing money key: ${key}`).toContain(key);
  });
});
