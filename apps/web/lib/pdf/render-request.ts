import 'server-only';

import type { DrizzleTx, GeneratedDocumentType } from '@dealerlink/db';

import { getLatestGeneratedDocument } from '@/lib/queries/generated-documents';
import { enqueueRenderPdfJob } from '@/lib/queue/client';

/**
 * Bridge from the web process to the workers PDF renderer (DEV.63).
 *
 * History: Day 10 (DEV.36) rendered PDFs by spawning the workers `render-cli`
 * as a child of the *web* process — which meant Chromium ran inside the web
 * container. That broke on DO App Platform (the buildpack base image has no
 * libnss3) and violated CLAUDE.md §7 ("never render PDFs on the web process").
 *
 * Now the web process enqueues a `render-pdf` pg-boss job and the workers
 * process (which has a Chromium-capable Dockerfile) renders it and writes a
 * `generated_documents` row. To keep the existing synchronous UX, this helper
 * blocks and polls for that row, then returns it — so callers are unchanged
 * apart from passing their transaction in.
 *
 * The poll runs on the caller's transaction (`tx`): `withTenant` uses the
 * Postgres default READ COMMITTED isolation, so each SELECT sees the worker's
 * committed insert, and reusing the held connection adds no pressure to the
 * tight managed-DB connection budget (DEV.61/62).
 */

export interface RenderPdfRequestInput {
  documentType: GeneratedDocumentType;
  documentId: string;
  tenantId: string;
  userId: string | null;
}

export interface RenderPdfRequestResult {
  generatedDocumentId: string;
  filename: string;
  sizeBytes: number;
}

/** Default wait before giving up (overridable via PDF_RENDER_TIMEOUT_MS). */
const DEFAULT_TIMEOUT_MS = 15_000;
/** How often to re-check for the rendered row. */
const POLL_INTERVAL_MS = 350;

function timeoutMs(): number {
  const fromEnv = Number(process.env.PDF_RENDER_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_TIMEOUT_MS;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Enqueue a render and wait for the resulting `generated_documents` row.
 *
 * Correlation: the row id present *before* enqueue is captured, and the poll
 * returns only once a row with a different (newer) id appears — so a pre-
 * existing render is never mistaken for this one. On timeout it throws a
 * friendly, retryable error; callers wrap it into their own AppError message.
 */
export async function requestPdfRender(
  tx: DrizzleTx,
  input: RenderPdfRequestInput,
): Promise<RenderPdfRequestResult> {
  const sinceId =
    (await getLatestGeneratedDocument(input.tenantId, input.documentType, input.documentId, tx))
      ?.id ?? null;

  await enqueueRenderPdfJob({
    documentType: input.documentType,
    documentId: input.documentId,
    tenantId: input.tenantId,
    userId: input.userId,
  });

  const deadline = Date.now() + timeoutMs();
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const latest = await getLatestGeneratedDocument(
      input.tenantId,
      input.documentType,
      input.documentId,
      tx,
    );
    if (latest && latest.id !== sinceId) {
      return {
        generatedDocumentId: latest.id,
        filename: latest.filename,
        sizeBytes: latest.sizeBytes,
      };
    }
  }

  throw new Error('the document is taking longer than expected to generate — please try again');
}
