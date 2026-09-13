/**
 * Resolve a document's "generated at" — keyed to the DOCUMENT, not to the render.
 *
 * Shared by the Typst render harness and the Chromium reference capture, and the
 * sharing is the point: if only one side pinned this value, every reference and
 * its render would disagree in the footer forever, and the difference would have
 * to be explained away rather than removed.
 *
 * The loaders set `generatedAt: new Date()`. That is a CORRECTNESS bug before it
 * is a determinism one — a PDF re-fetched three weeks after issue claims it was
 * generated today. It also makes a capture unreproducible: two captures minutes
 * apart differ in the footer, and Day 27 Phase 1.2 requires a baseline that
 * reproduces byte-identically, on the grounds that a baseline which does not
 * reproduce is not a baseline.
 *
 * Resolution order — both terms stable per document, neither wall-clock:
 *   1. the EARLIEST `generated_documents.generated_at` for this document, so the
 *      first render establishes the value and every later render reproduces it;
 *   2. failing that, the source row's own `created_at`, which F.67 pinned to the
 *      document's business date.
 *
 * (2) is the case worth being explicit about: a document rendered before any
 * `generated_documents` row exists is exactly where a wall-clock value could
 * sneak back in. It cannot here — `created_at` is written once and never moves,
 * so a first render and a render after the row appears agree. If BOTH are absent
 * this throws rather than silently substituting `new Date()`.
 *
 * This lives in the scripts layer, not in the loaders, because the loaders are
 * shared with the live HTML path and Day 26's guardrail was explicit that the
 * existing pipeline must not change. Day 27 Phase 3 moves it into the renderer
 * proper, at which point the loader can own it (F.66).
 */
import { sql } from 'drizzle-orm';

import { SOURCE_TABLE, type Kind } from './resolve-document';

export async function resolveGeneratedAt(
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
    `cannot resolve a stable generatedAt for ${type} ${documentId} — no ` +
      'generated_documents row and no source created_at. Refusing to fall back to ' +
      'wall-clock, which is the bug this resolution exists to remove.',
  );
}
