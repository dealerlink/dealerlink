/**
 * F.38 Day 26 — compare every NUMBER on each reference against its Typst render.
 *
 * Layout is reviewed by eye in `docs/typst-comparison/index.html`; the figures
 * have to be checked mechanically, because "no number on any document may
 * change" is F.38's standing guardrail and a wrong figure on a tax document is
 * not something a side-by-side reliably catches.
 *
 * Needs the scratch rasteriser install — see docs/RUNBOOKS.md R25.
 *
 *   node apps/workers/scripts/compare-figures.mjs <renders-dir>
 *
 * Exits non-zero if any document's set of money figures differs.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const TOOLS = process.env.PDF_TOOLS_DIR ?? '/tmp/pdf-tools';
const { getDocument } = await import(
  path.join(TOOLS, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')
);

const REFS = process.env.REFS_DIR ?? 'docs/pdf-references';
const RENDERS = process.argv[2];
if (!RENDERS) throw new Error('usage: compare-figures.mjs <renders-dir>');

async function extract(file) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(file)),
    useSystemFonts: false,
  }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    text += (await (await doc.getPage(p)).getTextContent()).items.map((i) => i.str).join('');
  }
  return text;
}

/** Every money-shaped token: digits with optional grouping and exactly 2 decimals. */
const figures = (t) => (t.match(/\d[\d,]*\.\d{2}/g) ?? []).slice().sort();

let differing = 0;
let total = 0;
for (const file of readdirSync(RENDERS).filter((f) => f.endsWith('.pdf')).sort()) {
  const ref = figures(await extract(path.join(REFS, file)));
  const typ = figures(await extract(path.join(RENDERS, file)));
  total += ref.length;
  const same = ref.length === typ.length && ref.every((v, i) => v === typ[i]);
  if (same) {
    console.log(`same ${file.padEnd(52)} ${String(ref.length).padStart(3)} figures`);
  } else {
    differing++;
    console.log(
      `DIFF ${file}\n   reference only: ${ref.filter((v) => !typ.includes(v)).join(' ')}` +
        `\n   render only:    ${typ.filter((v) => !ref.includes(v)).join(' ')}`,
    );
  }
}
console.log(
  differing === 0
    ? `\nALL ${total} FIGURES IDENTICAL across ${readdirSync(RENDERS).filter((f) => f.endsWith('.pdf')).length} documents`
    : `\n${differing} document(s) differ`,
);
process.exit(differing === 0 ? 0 : 1);
