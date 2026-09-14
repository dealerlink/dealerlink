/**
 * Typst rendering — the production PDF path (F.38 Day 27).
 *
 * Replaces the Puppeteer/Chromium pipeline. pg-boss and the `render-pdf` job
 * are unchanged; only what happens inside the job changed.
 *
 * Three properties this is built to guarantee, each of which the old pipeline
 * lacked:
 *
 *  - **Deterministic.** The same document renders to the same bytes, on any of
 *    our three architectures. Chromium could not do this — it stamps
 *    `/CreationDate` and `/ModDate` from the wall clock and numbers tagged-PDF
 *    structure elements from a per-process counter (DEV.125).
 *  - **Hermetic.** No network, and no dependence on host fonts. The old path
 *    fetched Google Fonts inside every render and silently fell back to system
 *    fonts when that failed.
 *  - **Snapshot-testable**, which is the capability the whole migration was for.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Repo-relative roots, resolved from this file so they work under tsx and dist. */
const PDF_DIR = __dirname;
const TEMPLATE_DIR = path.resolve(PDF_DIR, '../templates-typst');
const FONT_DIR = path.join(PDF_DIR, 'fonts');

/**
 * Resolve the Typst binary.
 *
 * `TYPST_BIN` wins so an image can place it anywhere; otherwise `typst` must be
 * on PATH. There is deliberately no download-on-demand: a renderer that fetches
 * a binary at run time is neither hermetic nor auditable, and F.66 records that
 * the npm wrapper package has been abandoned since 2023. Provisioning is the
 * image's job — see apps/workers/Dockerfile and docs/RUNBOOKS.md R26.
 */
export function resolveTypstBinary(): string {
  const fromEnv = process.env.TYPST_BIN;
  if (fromEnv) return fromEnv;
  try {
    return execFileSync('sh', ['-c', 'command -v typst'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'typst binary not found. Set TYPST_BIN or put `typst` on PATH. ' +
        'The workers image installs it; see docs/RUNBOOKS.md R26 for the pinned version.',
    );
  }
}

export interface TypstRenderInput {
  /** Entry template, relative to src/templates-typst (e.g. "quotation.typ"). */
  template: string;
  /** The view model the template reads as `json("data.json")`. */
  data: unknown;
  /**
   * The document's own instant. Drives `SOURCE_DATE_EPOCH`, which is what fixes
   * the PDF's internal timestamps.
   *
   * DERIVED FROM THE DOCUMENT, never from the clock and never from an env var
   * the caller happens to have set. If this were only pinned in tests, the
   * snapshots would prove a property production does not have.
   */
  generatedAt: Date;
  /** Optional logo bytes, written beside the data as `logo.svg`. */
  logoSvg?: Buffer | undefined;
}

/**
 * Render one document to PDF bytes.
 *
 * The templates are copied beside the data rather than the data being pointed at
 * the templates, because Typst resolves `json("data.json")` and `#import` paths
 * relative to the SOURCE FILE. The working directory is a fresh mkdtemp and is
 * removed in a finally, so concurrent renders cannot see each other's data —
 * which matters here: this is tenant data, and two tenants' documents can be in
 * flight at once.
 */
export function renderTypstPdf(input: TypstRenderInput): Buffer {
  const typst = resolveTypstBinary();
  const work = mkdtempSync(path.join(os.tmpdir(), 'dealerlink-typst-'));
  try {
    cpSync(TEMPLATE_DIR, work, { recursive: true });
    writeFileSync(path.join(work, 'data.json'), JSON.stringify(input.data));
    if (input.logoSvg) writeFileSync(path.join(work, 'logo.svg'), input.logoSvg);

    const out = path.join(work, 'out.pdf');
    const epoch = Math.floor(input.generatedAt.getTime() / 1000);

    execFileSync(
      typst,
      [
        'compile',
        '--root',
        work,
        // Hermetic typography: only the vendored faces, never the host's.
        '--font-path',
        FONT_DIR,
        '--ignore-system-fonts',
        // Both are set. SOURCE_DATE_EPOCH is the documented mechanism;
        // --creation-timestamp is explicit and wins if they ever disagree.
        '--creation-timestamp',
        String(epoch),
        path.join(work, input.template),
        out,
      ],
      {
        cwd: work,
        stdio: 'pipe',
        env: { ...process.env, SOURCE_DATE_EPOCH: String(epoch) },
      },
    );
    return readFileSync(out);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
