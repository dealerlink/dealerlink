/**
 * One-shot PDF render CLI.
 *
 * The web `generateQuotationPdf` Server Action spawns this as a subprocess
 * (DEV.36): it renders one document, persists the `generated_documents`
 * row, prints a JSON result to stdout, and exits.
 *
 * DAY 27: this used to exist so Puppeteer and its Chromium binary stayed out of
 * the web build (Day 10 guardrail). Rendering is now Typst — a subprocess with
 * no Node dependency to leak — so that reason is gone. The CLI stays because
 * removing it changes the web Server Action's contract, which belongs with the
 * apps/workers consolidation item rather than with the cutover.
 *
 * The pg-boss path (`handleRenderPdfJob`) wraps the exact same
 * `runRenderPdf` core and takes over in Day 14 when the queue is
 * bootstrapped; this CLI is the Phase-1 synchronous stand-in.
 *
 * Usage:
 *   node --import tsx src/pdf/render-cli.ts \
 *     --type quotation --document <id> --tenant <id> [--user <id>]
 *
 * Output (stdout): a single JSON line —
 *   { "ok": true,  "generatedDocumentId": "...", "filename": "...", "sizeBytes": N }
 *   { "ok": false, "error": "message" }
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { closeDbConnection } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';

import { runRenderPdf, type RenderableDocumentType } from '../jobs/render-pdf';

// Load DB credentials from the repo-root env files. When this CLI is spawned
// by the web Server Action the vars are already inherited from the parent
// process; dotenv does not override existing vars, so this is purely the
// standalone-invocation safety net. Safe to run after the imports above:
// the @dealerlink/db client is a lazy proxy (DEV.09) — it reads env on first
// query, not at import time.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

function readFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const documentType = (readFlag('type') ?? 'quotation') as RenderableDocumentType;
  const documentId = readFlag('document');
  const tenantId = readFlag('tenant');
  const userId = readFlag('user') ?? null;

  if (!documentId || !tenantId) {
    throw new Error('render-cli: --document and --tenant are required');
  }

  const result = await runRenderPdf({ documentType, documentId, tenantId, userId });
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
}

main()
  .then(async () => {
    await closeDbConnection();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
    await closeDbConnection().catch(() => undefined);
    process.exit(1);
  });
