import { type RenderPdfJobPayload } from '@dealerlink/schemas';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth/session';
import { enqueueRenderPdfJob } from '@/lib/queue/client';

/**
 * TEMPORARY operator-only Sentry **workers** smoke-test endpoint (D.1
 * diagnostic, DEV.77).
 *
 * The web `sentry-test` endpoint proves the *web* Sentry project; this one
 * proves the *workers* project (`dealerlink-workers-production`), which has no
 * other on-demand trigger. It enqueues a `render-pdf` pg-boss job carrying the
 * `THROW_ON_PURPOSE` sentinel documentType — the long-running workers process
 * picks it up and `handleRenderPdfJob` throws, exercising the real
 * pg-boss → `instrumentJobHandler` → `captureJobError` → Sentry path end to
 * end (the error is captured in the workers process, not here).
 *
 * Gated to the `operator` role; 404s for everyone else so its existence is not
 * disclosed. Not linked from any navigation. REMOVE after verification — it
 * must not ship past D.1 (see the matching removal of the workers sentinel).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Sentinel mirrored in apps/workers/src/jobs/render-pdf.ts. Inlined (not
// imported) because the web bundle must never import the workers/Puppeteer
// module graph (Day 10 guardrail). Typed as string so the payload object is a
// valid down-cast to RenderPdfJobPayload.
const SENTRY_SMOKE_TEST_DOCUMENT_TYPE: string = 'THROW_ON_PURPOSE';
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export async function POST() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.user.role !== 'operator') {
    // 404 (not 403) so the endpoint's existence is not disclosed.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // documentId/tenantId are placeholders — the handler throws on the sentinel
  // before it loads anything, so they are never dereferenced.
  const payload = {
    documentType: SENTRY_SMOKE_TEST_DOCUMENT_TYPE,
    documentId: NIL_UUID,
    tenantId: NIL_UUID,
    userId: ctx.user.id,
  } as RenderPdfJobPayload;

  const jobId = await enqueueRenderPdfJob(payload);

  return NextResponse.json({
    ok: true,
    message:
      'Enqueued a render-pdf job that will throw in the workers process. ' +
      'Check the dealerlink-workers-production Sentry project (~30s).',
    jobId,
  });
}
