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
 * Resolution order — **the source row's own `created_at` first**:
 *   1. the source row's `created_at`, which is written once, never moves, and
 *      F.67 pinned to the document's business date;
 *   2. failing that, the earliest `generated_documents.generated_at`.
 *
 * DAY 27 CHANGED THIS ORDER, and the reason is worth keeping. Day 26 put
 * `generated_documents` first, so "the first render establishes the value and
 * every later render reproduces it". That is stable per document but it is NOT
 * derivable from seed data: the first render's timestamp is a wall-clock fact.
 * The reference baseline was captured when no `generated_documents` row existed,
 * so it encodes `created_at` — and under the old order, the very first render of
 * a document would write a row that made every subsequent render disagree with
 * the baseline. A snapshot suite would pass once and then fail forever, for a
 * reason nobody would find quickly.
 *
 * `created_at` first makes the footer a pure function of the document, which is
 * what allows Phase 4.2 to assert on it rather than around it.
 *
 * If BOTH are absent this throws rather than silently substituting `new Date()`.
 */
import { sql } from 'drizzle-orm';

import type { RenderableKind } from './view-model';

/** Source table per document type. */
const SOURCE_TABLE: Record<RenderableKind, string> = {
  quotation: 'quotations',
  performa_invoice: 'performa_invoices',
  payment_receipt: 'payments',
  dispatch: 'dispatches',
};

export async function resolveGeneratedAt(
  tx: { execute: (q: unknown) => Promise<unknown> },
  type: RenderableKind,
  documentId: string,
): Promise<Date> {
  const src = (await tx.execute(
    sql`select created_at as at from ${sql.raw(SOURCE_TABLE[type])} where id = ${documentId}`,
  )) as Array<{ at: Date | string | null }>;
  const fromSource = src[0]?.at ?? null;
  if (fromSource) return new Date(fromSource);

  const first = (await tx.execute(sql`
    select min(generated_at) as at
    from generated_documents
    where document_type = ${type}::generated_document_type
      and document_id = ${documentId}
  `)) as Array<{ at: Date | string | null }>;
  const fromGenerated = first[0]?.at ?? null;
  if (fromGenerated) return new Date(fromGenerated);

  throw new Error(
    `cannot resolve a stable generatedAt for ${type} ${documentId} — no ` +
      'generated_documents row and no source created_at. Refusing to fall back to ' +
      'wall-clock, which is the bug this resolution exists to remove.',
  );
}
