/**
 * F.38 Day 26 — build the side-by-side comparison artifact.
 *
 * Rasterises the Chromium REFERENCE and the Typst RENDER of each case to PNG at
 * the same scale, extracts the text of both, and writes a single HTML page that
 * places them adjacent. The operator sign-off gate is reviewed from that page;
 * it needs no PDF viewer and no toolchain.
 *
 * pdfjs-dist and @napi-rs/canvas are NOT workspace dependencies — nothing in the
 * product rasterises a PDF, and adding two native-binary packages to apps/workers
 * for a review artifact is not a trade worth making. They are installed into a
 * scratch directory instead; docs/RUNBOOKS.md R25 records the command, so the
 * artifact is reproducible without them being vendored.
 *
 *   mkdir -p /tmp/pdf-tools && cd /tmp/pdf-tools \
 *     && npm install --no-save pdfjs-dist@4.10.38 @napi-rs/canvas@0.1.65
 *
 * Usage, from the repo root:
 *   node apps/workers/scripts/compare-typst.mjs \
 *     --refs docs/pdf-references --renders <dir> --out docs/typst-comparison
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const TOOLS = process.env.PDF_TOOLS_DIR ?? '/tmp/pdf-tools';
const { getDocument } = await import(
  path.join(TOOLS, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')
);
const { createCanvas } = await import(path.join(TOOLS, 'node_modules/@napi-rs/canvas/index.js'));

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const REFS = path.resolve(arg('refs', 'docs/pdf-references'));
const RENDERS = path.resolve(arg('renders', ''));
const OUT = path.resolve(arg('out', 'docs/typst-comparison'));
/** 1.4 keeps 9pt body type legible at 100% zoom without a 20 MB artifact. */
const SCALE = Number(process.env.RASTER_SCALE ?? 1.4);

/** Open once, hand back both the pixels and the text — they must agree. */
async function readPdf(file) {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(file)),
    useSystemFonts: false,
  }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: SCALE });
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
    const tc = await page.getTextContent();
    pages.push({
      png: canvas.toBuffer('image/png'),
      w: canvas.width,
      h: canvas.height,
      text: tc.items.map((i) => i.str).join(''),
      fonts: [...new Set(tc.items.map((i) => i.fontName))],
    });
  }
  const fonts = new Set();
  for (let p = 1; p <= doc.numPages; p++) {
    const commons = await (await doc.getPage(p)).getOperatorList();
    void commons;
  }
  return { numPages: doc.numPages, pages, fonts: [...fonts], bytes: readFileSync(file).length };
}

/** The five Phase 4.4 checks, answered from the extracted text of one file. */
function checks(text, numPages) {
  const rupee = [...text].filter((c) => c === '₹').length;
  // Indian grouping: the last group is three digits, every earlier one two.
  const grouped = [...text.matchAll(/\d[\d,]*\.\d{2}/g)].map((m) => m[0]);
  const lakhScale = grouped.filter((g) => g.replace(/[^\d]/g, '').length >= 8);
  const indianOk = lakhScale.every((g) => /^\d{1,2}(,\d{2})+,\d{3}\.\d{2}$/.test(g));
  const pageLabels = [...text.matchAll(/Page\s+(\d+)\s+of\s+(\d+)/g)].map((m) => m[0]);
  return {
    rupee,
    lakhSamples: [...new Set(lakhScale)].slice(0, 4),
    indianGrouping: lakhScale.length === 0 ? 'n/a' : indianOk ? 'ok' : 'WRONG',
    pageLabels,
    pageLabelOk:
      pageLabels.length === 0
        ? 'absent'
        : pageLabels.every((l) => l.endsWith(`of ${numPages}`)) && pageLabels.length === numPages
          ? 'ok'
          : 'WRONG',
    logoText: /DEMO SOLAR/.test(text) ? 'logo' : 'fallback',
    stateNames: /Maharashtra|Karnataka|Tamil Nadu|Gujarat|Delhi/.test(text)
      ? 'names'
      : /\b(MH|KA|TN|GJ|DL)\b/.test(text)
        ? 'CODES'
        : 'none',
  };
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const manifest = JSON.parse(
  readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'typst-matrix.json'), 'utf8'),
);

rmSync(path.join(OUT, 'img'), { recursive: true, force: true });
mkdirSync(path.join(OUT, 'img'), { recursive: true });

const rows = [];
for (const c of manifest) {
  const ref = await readPdf(path.join(REFS, `${c.label}.pdf`));
  const typ = await readPdf(path.join(RENDERS, `${c.label}.pdf`));
  const imgs = [];
  const maxPages = Math.max(ref.numPages, typ.numPages);
  for (let p = 0; p < maxPages; p++) {
    const pair = {};
    for (const [side, doc] of [
      ['ref', ref],
      ['typ', typ],
    ]) {
      const page = doc.pages[p];
      if (!page) continue;
      const name = `${c.label}__${side}__p${p + 1}.png`;
      writeFileSync(path.join(OUT, 'img', name), page.png);
      pair[side] = { name, w: page.w, h: page.h };
    }
    imgs.push(pair);
  }
  rows.push({
    label: c.label,
    type: c.type,
    ref: { pages: ref.numPages, bytes: ref.bytes, ...checks(ref.pages.map((x) => x.text).join('\n'), ref.numPages) },
    typ: { pages: typ.numPages, bytes: typ.bytes, ...checks(typ.pages.map((x) => x.text).join('\n'), typ.numPages) },
    refText: ref.pages.map((x) => x.text).join('\n—PAGE—\n'),
    typText: typ.pages.map((x) => x.text).join('\n—PAGE—\n'),
    imgs,
  });
  console.log(
    `${c.label.padEnd(50)} ref ${ref.numPages}p / typst ${typ.numPages}p  ` +
      `₹ ${rows.at(-1).ref.rupee}→${rows.at(-1).typ.rupee}  ` +
      `grouping ${rows.at(-1).typ.indianGrouping}  pages ${rows.at(-1).typ.pageLabelOk}`,
  );
}

writeFileSync(path.join(OUT, 'comparison-data.json'), `${JSON.stringify(rows.map(({ imgs, refText, typText, ...r }) => r), null, 2)}\n`);
writeFileSync(path.join(OUT, 'index.html'), page(rows));
console.log(`\nwrote ${OUT}/index.html (${rows.length} cases)`);

function page(rows) {
  const nav = rows
    .map((r) => `<a href="#${esc(r.label)}">${esc(r.label)}</a>`)
    .join('');
  const body = rows
    .map(
      (r) => `
<section id="${esc(r.label)}">
  <h2>${esc(r.label)}</h2>
  <table class="meta">
    <tr><th></th><th>Chromium reference</th><th>Typst render</th></tr>
    <tr><td>pages</td><td>${r.ref.pages}</td><td class="${r.ref.pages === r.typ.pages ? 'ok' : 'bad'}">${r.typ.pages}</td></tr>
    <tr><td>bytes</td><td>${r.ref.bytes.toLocaleString()}</td><td>${r.typ.bytes.toLocaleString()}</td></tr>
    <tr><td>₹ extracted</td><td>${r.ref.rupee}</td><td class="${r.typ.rupee > 0 ? 'ok' : 'bad'}">${r.typ.rupee}</td></tr>
    <tr><td>Indian grouping</td><td>${r.ref.indianGrouping}</td><td class="${r.typ.indianGrouping === 'WRONG' ? 'bad' : 'ok'}">${r.typ.indianGrouping} <span class="dim">${esc(r.typ.lakhSamples.join(' '))}</span></td></tr>
    <tr><td>Page X of Y</td><td>${r.ref.pageLabelOk} <span class="dim">${esc(r.ref.pageLabels.slice(0, 3).join(' '))}</span></td><td class="${r.typ.pageLabelOk === 'WRONG' ? 'bad' : 'ok'}">${r.typ.pageLabelOk} <span class="dim">${esc(r.typ.pageLabels.slice(0, 3).join(' '))}</span></td></tr>
    <tr><td>header mark</td><td>${r.ref.logoText}</td><td class="${r.ref.logoText === r.typ.logoText ? 'ok' : 'bad'}">${r.typ.logoText}</td></tr>
    <tr><td>state display</td><td>${r.ref.stateNames}</td><td class="${r.typ.stateNames === 'CODES' ? 'bad' : 'ok'}">${r.typ.stateNames}</td></tr>
  </table>
  ${r.imgs
    .map(
      (pair, i) => `
  <div class="pair">
    <figure><figcaption>reference · page ${i + 1}</figcaption>${pair.ref ? `<img src="img/${pair.ref.name}" width="${pair.ref.w}" height="${pair.ref.h}">` : '<div class="missing">no page</div>'}</figure>
    <figure><figcaption>Typst · page ${i + 1}</figcaption>${pair.typ ? `<img src="img/${pair.typ.name}" width="${pair.typ.w}" height="${pair.typ.h}">` : '<div class="missing">no page</div>'}</figure>
  </div>`,
    )
    .join('')}
  <details><summary>extracted text</summary>
    <div class="pair">
      <pre>${esc(r.refText)}</pre>
      <pre>${esc(r.typText)}</pre>
    </div>
  </details>
</section>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Dealerlink F.38 — Chromium vs Typst</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #0f172a; background: #f8fafc; }
  header { position: sticky; top: 0; background: #0f172a; color: #fff; padding: 12px 20px; z-index: 2; }
  header h1 { margin: 0 0 6px; font-size: 16px; }
  nav a { color: #cbd5e1; font-size: 11px; margin-right: 10px; text-decoration: none; }
  nav a:hover { color: #fff; text-decoration: underline; }
  section { padding: 24px 20px; border-bottom: 1px solid #e2e8f0; }
  h2 { font-size: 15px; font-family: ui-monospace, monospace; }
  table.meta { border-collapse: collapse; margin-bottom: 14px; font-size: 12px; }
  table.meta th, table.meta td { border: 1px solid #e2e8f0; padding: 3px 10px; text-align: left; }
  table.meta th { background: #f1f5f9; }
  .ok { background: #f0fdf4; } .bad { background: #fef2f2; font-weight: 600; }
  .dim { color: #64748b; font-family: ui-monospace, monospace; }
  .pair { display: flex; gap: 14px; align-items: flex-start; overflow-x: auto; }
  figure { margin: 0 0 14px; }
  figcaption { font-size: 11px; color: #64748b; margin-bottom: 4px; }
  img { border: 1px solid #cbd5e1; background: #fff; max-width: 100%; height: auto; }
  .missing { border: 1px dashed #cbd5e1; padding: 40px; color: #94a3b8; }
  pre { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; font-size: 10px; background: #fff; border: 1px solid #e2e8f0; padding: 8px; }
  details { margin-top: 8px; }
</style></head><body>
<header><h1>F.38 — Chromium reference vs Typst render · ${rows.length} cases</h1><nav>${nav}</nav></header>
${body}
</body></html>`;
}
