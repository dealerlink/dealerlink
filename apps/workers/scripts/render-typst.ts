/**
 * F.38 Day 26 — render a document through the Typst templates.
 *
 * Uses the SAME loaders the HTML templates use (`loadQuotationPdfData` and
 * friends), so no data logic is duplicated and no number is recomputed on the
 * way to a template. The loader's output is serialised to JSON, the Typst
 * template reads it with `json("data.json")`, and Typst produces the PDF.
 *
 * This does NOT touch the render pipeline. `render-pdf.ts`, the queue consumer
 * and Chromium are all untouched — cutover is Day 27 and only after sign-off.
 *
 * Usage, from apps/workers:
 *   pnpm exec tsx scripts/render-typst.ts --manifest <matrix.json> --out <dir>
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { withTenant, closeDbConnection } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { sql } from 'drizzle-orm';

import { formatDocDate, formatGeneratedAt, formatMoney } from '../src/lib/format';
import { loadDispatchNotePdfData } from '../src/templates/dispatch-note';
import { loadPaymentReceiptPdfData } from '../src/templates/payment-receipt';
import { loadPerformaInvoicePdfData } from '../src/templates/performa-invoice';
import { loadQuotationPdfData } from '../src/templates/quotation';

import { resolveDocument, SOURCE_TABLE, type DocumentCase, type Kind } from './resolve-document';

const repoRoot = path.resolve(__dirname, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

/**
 * Pinned so renders are reproducible. Day 25 proved output is byte-identical
 * across arm64 and x86-64 ONLY with this pinned; unpinned, the timestamp and
 * the DocumentID derived from it move on every render. F.66 records that the
 * production renderer must pin this itself rather than relying on an env var.
 */
const SOURCE_DATE_EPOCH = '1700000000';

const TYPST = process.env.TYPST_BIN ?? '/tmp/typst-spike/typst-aarch64-unknown-linux-musl/typst';

/**
 * Money and dates are formatted HERE, with the SAME helpers the HTML templates
 * use (`formatMoney`, `formatDocDate`), and the template prints the resulting
 * string. Two reasons, and the second is the important one:
 *
 *  - Indian digit grouping and the `06-Sept-2026` date format both come from
 *    `Intl`, whose exact output (en-GB's four-letter "Sept", for one) is not
 *    worth reimplementing in Typst markup. Reimplementing it would guarantee a
 *    class of difference that has nothing to do with layout.
 *  - It makes "numbers are read, never computed" structural rather than a rule
 *    to remember: by the time a value reaches a template it is already a
 *    string, so a template CANNOT do arithmetic on it.
 *
 * Raw numerics are kept alongside under `*Raw` for anything that needs a
 * comparison (the totals block tests `unallocatedAmount > 0`).
 */
const MONEY_KEYS = new Set([
  'subtotal',
  'discountAmount',
  'taxableAmount',
  'cgstAmount',
  'sgstAmount',
  'igstAmount',
  'totalAmount',
  'amount',
  'unallocatedAmount',
  'unitPrice',
  'lineDiscount',
  'taxableValue',
  'gstAmount',
  'lineTotal',
]);
const DATE_KEYS = new Set([
  'quoteDate',
  'validUntil',
  'receiptDate',
  'depositedDate',
  'dispatchDate',
  'orderDate',
  'expectedDeliveryDate',
  'ewayBillDate',
  'piDate',
]);

function toViewModel(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) return null;
  // `generatedAt` is the only Date, and the footer wants the timestamped
  // form (`11-Sept-2026 23:00 IST`), not the date-only one.
  if (value instanceof Date)
    return key === 'generatedAt' ? formatGeneratedAt(value) : formatDocDate(value);
  if (Array.isArray(value)) return value.map((v) => toViewModel(v));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toViewModel(v, k);
      if (typeof v === 'number' && MONEY_KEYS.has(k)) out[`${k}Raw`] = v;
    }
    return out;
  }
  if (typeof value === 'number' && key && MONEY_KEYS.has(key)) return formatMoney(value);
  if (typeof value === 'string' && key && DATE_KEYS.has(key) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatDocDate(value.slice(0, 10));
  }
  return value;
}

/**
 * Resolve the document's "generated at" — KEYED TO THE DOCUMENT, not to this
 * render.
 *
 * The loaders currently set `generatedAt: new Date()`, so the footer claims a
 * document was generated whenever it was last rendered. That is a CORRECTNESS
 * bug before it is a determinism one: a PDF re-fetched three weeks after issue
 * says it was generated today. Determinism is the consequence of fixing it.
 *
 * Resolution order — both terms stable per document, neither wall-clock:
 *   1. the EARLIEST `generated_documents.generated_at` for this document, so
 *      the first render establishes the value and every later render
 *      reproduces it;
 *   2. failing that, the source row's own `created_at`.
 *
 * (2) is the case worth being explicit about: a document rendered before any
 * `generated_documents` row exists is exactly where a wall-clock value could
 * sneak back in. It cannot here — `created_at` is written once when the
 * document is created and never moves, so a first render and a render after
 * the row appears agree. If BOTH are absent the render fails loudly rather
 * than silently substituting `new Date()`.
 */
async function resolveGeneratedAt(
  tx: { execute: (q: unknown) => Promise<unknown> },
  type: Kind,
  documentId: string,
): Promise<Date> {
  const first = (await tx.execute(sql`
    select min(generated_at) as at
    from generated_documents
    where document_type = ${type}::generated_document_type
      and document_id = ${documentId}
  `)) as Array<{ at: Date | string | null }>;
  const fromGenerated = first[0]?.at ?? null;
  if (fromGenerated) return new Date(fromGenerated);

  const src = (await tx.execute(
    sql`select created_at as at from ${sql.raw(SOURCE_TABLE[type])} where id = ${documentId}`,
  )) as Array<{ at: Date | string | null }>;
  const fromSource = src[0]?.at ?? null;
  if (fromSource) return new Date(fromSource);

  throw new Error(
    `render-typst: cannot resolve a stable generatedAt for ${type} ${documentId} — ` +
      'no generated_documents row and no source created_at. Refusing to fall back to ' +
      'wall-clock, which is the bug this resolution exists to remove.',
  );
}

const loaders = {
  quotation: loadQuotationPdfData,
  performa_invoice: loadPerformaInvoicePdfData,
  payment_receipt: loadPaymentReceiptPdfData,
  dispatch: loadDispatchNotePdfData,
};

const templateFor: Record<Kind, string> = {
  quotation: 'quotation.typ',
  // The PI reuses the quotation SHAPE in the HTML templates (performa-invoice
  // delegates to renderQuotationHtml). Kept as its own Typst entry point so the
  // two can diverge later without the copy-paste that produced the current
  // inconsistencies — it imports the quotation body rather than duplicating it.
  performa_invoice: 'performa-invoice.typ',
  payment_receipt: 'payment-receipt.typ',
  dispatch: 'dispatch-note.typ',
};

/**
 * The branded cases' logo, read from the fixture SQL that produced the branded
 * REFERENCES — one source of truth, and no database mutation.
 *
 * Capture deliberately does not mutate tenant data, and rendering should not
 * either; toggling `tenant_settings.logo_url` between a branded and an
 * unbranded run also makes the 14 cases un-renderable in one pass. Since Day 25
 * established that branded and unbranded are the SAME document differing only in
 * the logo, supplying it per case reproduces exactly that relationship, and the
 * unbranded cases render with the logo forced off regardless of the row's
 * current state — so a leftover fixture cannot silently brand ten references.
 */
function fixtureLogo(): string {
  const sqlText = readFileSync(path.join(__dirname, 'branded-tenant-fixture.sql'), 'utf8');
  const m = /'(data:image\/[^']+)'/.exec(sqlText);
  if (!m) throw new Error('branded-tenant-fixture.sql no longer contains a data: URI logo');
  return m[1]!;
}

/** Turn a `data:` URI into a file Typst's `image()` can read. */
function writeLogo(dir: string, logoUrl: string | null): void {
  if (!logoUrl) return;
  const m = /^data:image\/(svg\+xml|png|jpeg);base64,(.*)$/.exec(logoUrl);
  if (!m) return;
  const ext = m[1] === 'svg+xml' ? 'svg' : m[1] === 'jpeg' ? 'jpg' : 'png';
  writeFileSync(path.join(dir, `logo.${ext}`), Buffer.from(m[2]!, 'base64'));
  // The templates reference `logo.svg`; normalise so they need no branching.
  if (ext !== 'svg') writeFileSync(path.join(dir, 'logo.svg'), Buffer.from(m[2]!, 'base64'));
}

async function main(): Promise<void> {
  const mi = process.argv.indexOf('--manifest');
  const oi = process.argv.indexOf('--out');
  if (mi === -1 || oi === -1) throw new Error('--manifest and --out are required');
  const cases: DocumentCase[] = JSON.parse(readFileSync(process.argv[mi + 1]!, 'utf8'));
  const outDir = path.resolve(process.argv[oi + 1]!);
  mkdirSync(outDir, { recursive: true });

  const tplDir = path.join(__dirname, '../src/templates-typst');
  const results: Record<string, unknown>[] = [];

  for (const c of cases) {
    const work = path.join(os.tmpdir(), `typst-${c.label}`);
    try {
      rmSync(work, { recursive: true, force: true });
      mkdirSync(work, { recursive: true });

      const { tenantId, documentId } = await resolveDocument(c);
      const data = await withTenant(tenantId, async (tx) => {
        const load = loaders[c.type] as (
          tx: unknown,
          tenantId: string,
          documentId: string,
        ) => Promise<unknown>;
        const loaded = (await load(tx, tenantId, documentId)) as Record<string, unknown>;
        // Override the loader's wall-clock value. Done HERE rather than in the
        // loader because the loaders are shared with the HTML path, and Day 26's
        // guardrail is explicit that the existing pipeline must not change —
        // changing it would also invalidate the references being diffed against.
        // Day 27 moves this into the renderer proper (F.66), at which point the
        // HTML path retires and the loader can own it.
        loaded['generatedAt'] = await resolveGeneratedAt(
          tx as unknown as { execute: (q: unknown) => Promise<unknown> },
          c.type,
          documentId,
        );
        return loaded;
      });

      const vm = toViewModel(data) as Record<string, unknown>;
      // The allocated total is derived, not stored — the HTML template reduces
      // over the rows at render time. Computed HERE rather than in the Typst
      // template, because arithmetic in a template is what CLAUDE.md rules out.
      const allocs = (data as { allocations?: { amount: number }[] }).allocations;
      if (allocs) vm['allocatedTotal'] = formatMoney(allocs.reduce((t, a) => t + a.amount, 0));

      // Line-items column totals and the halved rate label. The HTML derives
      // these at render time (LineItemsTable reduces over the rows; TaxSummary
      // halves gstRateLabel for the CGST/SGST captions). Derived HERE for the
      // same reason as the allocation total: a template must not do arithmetic.
      const lines = (
        data as {
          lines?: {
            quantity: number;
            taxableValue: number;
            gstAmount: number;
            lineTotal: number;
          }[];
        }
      ).lines;
      if (lines) {
        vm['totalQuantity'] = lines.reduce((t, l) => t + l.quantity, 0);
        vm['totalTaxable'] = formatMoney(lines.reduce((t, l) => t + l.taxableValue, 0));
        vm['totalGstAmount'] = formatMoney(lines.reduce((t, l) => t + l.gstAmount, 0));
        vm['totalLineAmount'] = formatMoney(lines.reduce((t, l) => t + l.lineTotal, 0));
      }
      // The running page footer names the document in TITLE case — 'Quotation
      // QT-…', not 'QUOTATION QT-…' — because buildFooterTemplate() writes a
      // literal rather than reusing the heading. Supplied here so the templates
      // do not have to case-convert a heading back.
      vm['footerLabel'] = {
        quotation: 'Quotation',
        performa_invoice: 'Performa Invoice',
        payment_receipt: 'Receipt',
        dispatch: 'Dispatch',
      }[c.type];
      const rateLabel = (data as { gstRateLabel?: string | null }).gstRateLabel ?? null;
      vm['halfRateLabel'] = rateLabel != null ? `${Number(rateLabel) / 2}%` : '';
      vm['fullRateLabel'] = rateLabel != null ? `${rateLabel}%` : '';
      const logoUrl = c.branded ? fixtureLogo() : null;
      const billFrom = vm['billFrom'] as Record<string, unknown> | undefined;
      if (billFrom) billFrom['logoUrl'] = logoUrl;
      writeLogo(work, logoUrl);
      writeFileSync(path.join(work, 'data.json'), JSON.stringify(vm, null, 2));

      // Typst resolves `json("data.json")` and `#import "_lib/..."` relative to
      // the SOURCE FILE, not the working directory. So the templates are copied
      // beside the data rather than the data being pointed at the templates —
      // which also keeps the repo clean of per-render artefacts.
      cpSync(tplDir, work, { recursive: true });
      const entry = path.join(work, templateFor[c.type]);
      const pdf = path.join(outDir, `${c.label}.pdf`);
      execFileSync(TYPST, ['compile', '--root', work, entry, pdf], {
        env: { ...process.env, SOURCE_DATE_EPOCH },
        cwd: work,
        stdio: 'pipe',
      });
      const bytes = readFileSync(pdf).length;
      results.push({ ...c, tenantId, documentId, ok: true, sizeBytes: bytes });
      console.log(`OK   ${c.label.padEnd(46)} ${String(bytes).padStart(8)} bytes`);
    } catch (err) {
      const e = err as { stderr?: Buffer; message?: string };
      const msg = (e.stderr?.toString() || e.message || 'unknown')
        .split('\n')
        .slice(0, 4)
        .join(' | ');
      results.push({ ...c, ok: false, error: msg });
      console.log(`FAIL ${c.label.padEnd(46)} ${msg.slice(0, 110)}`);
    }
  }

  writeFileSync(
    path.join(outDir, 'typst-results.json'),
    `${JSON.stringify({ results }, null, 2)}\n`,
  );
  console.log(`\nrendered ${results.filter((r) => r.ok).length}/${cases.length}`);
}

main()
  .then(async () => {
    await closeDbConnection();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await closeDbConnection().catch(() => {});
    process.exit(1);
  });
