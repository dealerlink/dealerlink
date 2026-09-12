/**
 * F.38 Day 25 — reference PDF capture.
 *
 * Renders known-good PDFs from the CURRENT Chromium pipeline so Day 26's Typst
 * templates have a diff target. It calls the SAME builders and the SAME
 * `renderPdfFromHtml` that `runRenderPdf` uses in production, but writes the
 * buffer to disk instead of persisting a `generated_documents` row — capture
 * must not mutate tenant data.
 *
 * Usage, from apps/workers:
 *   pnpm exec tsx scripts/capture-references.ts --manifest <matrix.json>
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { withTenant, closeDbConnection } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';

import { shutdownBrowser } from '../src/pdf/browser';
import { renderPdfFromHtml } from '../src/pdf/render';
import { buildDispatchNoteHtml } from '../src/templates/dispatch-note';
import { buildPaymentReceiptHtml } from '../src/templates/payment-receipt';
import { buildPerformaInvoiceHtml } from '../src/templates/performa-invoice';
import { buildQuotationHtml } from '../src/templates/quotation';

import { resolveDocument, type DocumentCase } from './resolve-document';

const repoRoot = path.resolve(__dirname, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

/**
 * DEV.89 — on arm64 the workers' `@sparticuz/chromium` is an x86-64 binary that
 * cannot launch, so point at the arm64 Chromium Playwright installs. WHICH
 * binary rendered a reference is recorded in the manifest: if a reference later
 * disagrees with a Typst render, we need to know whether the reference itself
 * is suspect. Read lazily by resolveLaunchConfig(), so setting it here is in
 * time.
 */
function findPlaywrightChromium(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH || process.arch === 'x64') return undefined;
  const base = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!existsSync(base)) return undefined;
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith('chromium-') || dir.includes('headless')) continue;
    const exe = path.join(base, dir, 'chrome-linux', 'chrome');
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

/**
 * A case names its document by NUMBER, not by uuid — see resolve-document.ts.
 * This script originally took `tenantId` and `documentId` straight from the
 * manifest, which is how Day 25's manifests came to name ids that no longer
 * exist (DEV.119). Re-capturing a reference must address the same document the
 * Typst render does, or the diff is between two different documents.
 */
type Case = DocumentCase;

const builders = {
  quotation: buildQuotationHtml,
  performa_invoice: buildPerformaInvoiceHtml,
  payment_receipt: buildPaymentReceiptHtml,
  dispatch: buildDispatchNoteHtml,
};

async function main(): Promise<void> {
  const resolved = findPlaywrightChromium();
  if (resolved) process.env.PUPPETEER_EXECUTABLE_PATH = resolved;

  const idx = process.argv.indexOf('--manifest');
  if (idx === -1) throw new Error('--manifest <file.json> is required');
  const cases: Case[] = JSON.parse(readFileSync(process.argv[idx + 1]!, 'utf8'));

  const OUT = path.join(repoRoot, 'docs/pdf-references');
  mkdirSync(OUT, { recursive: true });

  const results: Record<string, unknown>[] = [];
  for (const c of cases) {
    try {
      const { tenantId, documentId } = await resolveDocument(c);
      const out = await withTenant(tenantId, async (tx) => {
        const build = builders[c.type] as (
          tx: unknown,
          tenantId: string,
          documentId: string,
        ) => Promise<{ html: string; footerTemplate?: string; filename: string }>;
        const built = await build(tx, tenantId, documentId);
        const buffer = await renderPdfFromHtml(built.html, {
          format: 'A4',
          margin: { top: '14mm', bottom: '20mm' },
          ...(built.footerTemplate ? { footerTemplate: built.footerTemplate } : {}),
        });
        return { buffer, filename: built.filename };
      });
      writeFileSync(path.join(OUT, `${c.label}.pdf`), out.buffer);
      results.push({
        ...c,
        tenantId,
        documentId,
        sizeBytes: out.buffer.length,
        productionFilename: out.filename,
        ok: true,
        renderedBy: process.env.PUPPETEER_EXECUTABLE_PATH ?? '@sparticuz/chromium (default)',
        arch: process.arch,
        capturedAt: new Date().toISOString(),
      });
      console.log(`OK   ${c.label.padEnd(36)} ${String(out.buffer.length).padStart(8)} bytes`);
    } catch (err) {
      results.push({ ...c, ok: false, error: (err as Error).message });
      console.log(`FAIL ${c.label.padEnd(36)} ${(err as Error).message.slice(0, 90)}`);
    }
  }

  // MERGE by label rather than overwrite. The first version of this script
  // rewrote the file wholesale per run, so a one-document smoke run silently
  // clobbered the full-matrix provenance record — and that clobbered version got
  // committed. The README makes provenance load-bearing for diagnosing a Day 26
  // mismatch, so a partial record is worse than none.
  //
  // Merging is the correct behaviour rather than a guard against operator
  // sloppiness: branded and unbranded cases need DIFFERENT fixture state in the
  // database and therefore cannot share a single run, so a complete record is
  // necessarily assembled from several.
  const resultsPath = path.join(OUT, 'capture-results.json');
  const byLabel = new Map<string, Record<string, unknown>>();
  if (existsSync(resultsPath)) {
    try {
      const prev = JSON.parse(readFileSync(resultsPath, 'utf8')) as {
        results?: Record<string, unknown>[];
      };
      for (const r of prev.results ?? []) byLabel.set(String(r.label), r);
    } catch {
      // A corrupt or older-shaped file is replaced rather than trusted.
    }
  }
  for (const r of results) byLabel.set(String(r.label), r);
  const merged = [...byLabel.values()].sort((a, b) =>
    String(a.label).localeCompare(String(b.label)),
  );
  writeFileSync(resultsPath, `${JSON.stringify({ results: merged }, null, 2)}\n`);
  console.log(`\ncaptured ${results.filter((r) => r.ok).length}/${cases.length}`);
}

main()
  .then(async () => {
    await shutdownBrowser();
    await closeDbConnection();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await shutdownBrowser().catch(() => {});
    await closeDbConnection().catch(() => {});
    process.exit(1);
  });
