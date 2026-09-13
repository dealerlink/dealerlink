/**
 * Cross-architecture byte-determinism check on a REAL document (F.66).
 *
 * Replaces the synthetic fixture this job used to compile. That fixture had no
 * timestamp in it at all, so it could not have caught the defect Day 26 actually
 * found — `generatedAt: new Date()` in the shared loaders made every render of a
 * real document differ from the last, while the fixture sat green. A check that
 * cannot fail for the reason the system actually breaks is decoration.
 *
 * What this asserts: the same document, rendered from the same pinned seed,
 * produces the same BYTES on x86-64 CI as it did on the arm64 devcontainer where
 * the expected hash was recorded.
 *
 * If it fails, the question is which of two things changed:
 *   - Typst's layout (a version bump — the installer pins and verifies, so this
 *     should be impossible without a commit), or
 *   - the document's data (a seed change).
 * Both are real failures. DO NOT re-record the hash to make this pass; that
 * discards the only evidence that either happened.
 *
 * Usage:
 *   pnpm exec tsx scripts/determinism-check.ts            # compare
 *   pnpm exec tsx scripts/determinism-check.ts --record   # write the hash
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { withTenant, closeDbConnection } from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';

import { resolveGeneratedAt } from '../src/pdf/generated-at';
import { renderTypstPdf } from '../src/pdf/typst';
import { buildViewModel, logoSvgFrom, TEMPLATE_FOR } from '../src/pdf/view-model';
import { loadDispatchNotePdfData } from '../src/templates/dispatch-note';

import { resolveDocument } from './resolve-document';

const repoRoot = path.resolve(__dirname, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

/**
 * The 500-serial dispatch note: the heaviest and most layout-sensitive document
 * in the corpus, and the only multi-page one. If any layout property is
 * architecture-dependent, this is where it shows.
 */
const CASE = { type: 'dispatch', tenantSlug: 'demo', documentNumber: 'DSP-REF-0500' } as const;
const EXPECTED_FILE = path.join(__dirname, 'determinism-expected.json');

async function main(): Promise<void> {
  const { tenantId, documentId } = await resolveDocument(CASE);
  const buffer = await withTenant(tenantId, async (tx) => {
    const data = (await loadDispatchNotePdfData(tx, tenantId, documentId)) as unknown as Record<
      string,
      unknown
    >;
    data['generatedAt'] = await resolveGeneratedAt(
      tx as unknown as { execute: (q: unknown) => Promise<unknown> },
      'dispatch',
      documentId,
    );
    (data['billFrom'] as Record<string, unknown>)['logoUrl'] = null;
    return renderTypstPdf({
      template: TEMPLATE_FOR.dispatch,
      data: buildViewModel('dispatch', data),
      generatedAt: data['generatedAt'] as Date,
      logoSvg: logoSvgFrom(data),
    });
  });

  const actual = createHash('sha256').update(buffer).digest('hex');
  console.log(`document : ${CASE.documentNumber} (${buffer.length} bytes)`);
  console.log(`arch     : ${process.arch}`);
  console.log(`actual   : ${actual}`);

  if (process.argv.includes('--record')) {
    writeFileSync(
      EXPECTED_FILE,
      `${JSON.stringify({ document: CASE.documentNumber, sha256: actual, recordedOn: process.arch, bytes: buffer.length }, null, 2)}\n`,
    );
    console.log(`recorded to ${path.relative(repoRoot, EXPECTED_FILE)}`);
    await closeDbConnection();
    return;
  }

  const expected = JSON.parse(readFileSync(EXPECTED_FILE, 'utf8')) as {
    sha256: string;
    recordedOn: string;
  };
  console.log(`expected : ${expected.sha256}  (recorded on ${expected.recordedOn})`);
  await closeDbConnection();

  if (actual !== expected.sha256) {
    console.error('\nMISMATCH — a real document does not render to the same bytes.');
    console.error('Either Typst changed (the installer pins and verifies a version, so this');
    console.error('needs a commit) or the seeded data changed. Both are real failures.');
    console.error('Do NOT re-record the hash to make this pass.');
    process.exit(1);
  }
  console.log('\nMATCH — byte-identical across architectures, on a real document.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
