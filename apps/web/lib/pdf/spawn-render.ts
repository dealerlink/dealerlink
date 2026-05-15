import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Bridge from the web process to the workers PDF renderer.
 *
 * Day 10 renders a PDF by spawning the workers `render-cli` as a one-shot
 * subprocess (DEV.36). This is deliberate:
 *
 *  - Puppeteer + the Chromium binary stay entirely inside the workers
 *    process — the web bundle never imports puppeteer-core (Day 10
 *    guardrail).
 *  - It is synchronous from the caller's point of view (await the child),
 *    which is all Day 10 needs — no async job-polling UI.
 *  - It needs no running workers process and no pg-boss bootstrap (pg-boss
 *    lands in Day 14, which will swap this bridge for a real `render-pdf`
 *    enqueue against the already-written `handleRenderPdfJob`).
 *
 * The child inherits `process.env` (so DATABASE_URL etc. flow through) and
 * runs with cwd = apps/workers so its workspace imports + `tsx` resolve.
 */

export interface SpawnRenderResult {
  generatedDocumentId: string;
  filename: string;
  sizeBytes: number;
}

interface SpawnRenderInput {
  documentType: 'quotation' | 'invoice' | 'dispatch' | 'payment_receipt';
  documentId: string;
  tenantId: string;
  userId: string | null;
}

/** Hard cap — Chromium launch + 30s render budget + headroom. */
const RENDER_TIMEOUT_MS = 60_000;

export async function spawnPdfRender(input: SpawnRenderInput): Promise<SpawnRenderResult> {
  // `next dev`/`next start` run with cwd = apps/web; the repo root is two up.
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  const workersDir = path.join(repoRoot, 'apps', 'workers');
  const renderCli = path.join(workersDir, 'src', 'pdf', 'render-cli.ts');

  const args = [
    '--import',
    'tsx',
    renderCli,
    '--type',
    input.documentType,
    '--document',
    input.documentId,
    '--tenant',
    input.tenantId,
  ];
  if (input.userId) args.push('--user', input.userId);

  return new Promise<SpawnRenderResult>((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: workersDir,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('PDF render timed out'));
    }, RENDER_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // The CLI prints one JSON line; take the last non-empty line so any
      // stray loader noise on stdout is ignored.
      const line = stdout.trim().split('\n').filter(Boolean).pop() ?? '';
      let parsed: { ok: boolean; error?: string } & Partial<SpawnRenderResult>;
      try {
        parsed = JSON.parse(line) as typeof parsed;
      } catch {
        reject(
          new Error(
            `PDF render produced no result (exit ${String(code)}): ${stderr.slice(-400) || stdout.slice(-400)}`,
          ),
        );
        return;
      }
      if (!parsed.ok || !parsed.generatedDocumentId) {
        reject(new Error(parsed.error ?? 'PDF render failed'));
        return;
      }
      resolve({
        generatedDocumentId: parsed.generatedDocumentId,
        filename: parsed.filename ?? 'document.pdf',
        sizeBytes: parsed.sizeBytes ?? 0,
      });
    });
  });
}
