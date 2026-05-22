'use server';

import { accessLog, dealers, dispatches, tenants, type DrizzleTx } from '@dealerlink/db';
import { dispatchIdInputSchema } from '@dealerlink/schemas';
import { eq } from 'drizzle-orm';

import { tenantAction } from '@/lib/actions/wrap';
import { queueEmail } from '@/lib/email/send';
import { renderDocumentEmail } from '@/lib/email/templates/document-delivery';
import { AppError } from '@/lib/errors';
import { requestPdfRender } from '@/lib/pdf/render-request';
import {
  getGeneratedDocumentPayload,
  getLatestGeneratedDocument,
} from '@/lib/queries/generated-documents';

/** Load a dispatch header for guard checks (tenant-scoped by RLS). */
async function loadDispatchHeader(tx: DrizzleTx, id: string) {
  const [d] = await tx
    .select({
      id: dispatches.id,
      tenantId: dispatches.tenantId,
      dispatchNumber: dispatches.dispatchNumber,
      shipToDealerId: dispatches.shipToDealerId,
    })
    .from(dispatches)
    .where(eq(dispatches.id, id))
    .limit(1);
  return d ?? null;
}

/**
 * Render (or re-render) a dispatch note to PDF via the workers subprocess
 * (DEV.36). The dispatch note is tax-neutral — no tax engine call. Available
 * to admin + dispatch + accounts (accounts may need it for reconciliation).
 */
export const generateDispatchPdf = tenantAction(
  ['admin', 'dispatch', 'accounts'],
  dispatchIdInputSchema,
  async ({ tx, input, auth }) => {
    const dispatch = await loadDispatchHeader(tx, input.id);
    if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found');
    try {
      const result = await requestPdfRender(tx, {
        documentType: 'dispatch',
        documentId: input.id,
        tenantId: dispatch.tenantId,
        userId: auth.user.id,
      });
      return {
        documentId: result.generatedDocumentId,
        filename: result.filename,
        sizeBytes: result.sizeBytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed';
      throw new AppError('INTERNAL', `Could not generate the dispatch note — ${message}`);
    }
  },
);

export interface DispatchPdfDownload {
  filename: string;
  mimeType: string;
  base64: string | null;
  url: string | null;
}

/** Return the latest dispatch-note PDF, rendering one on first request. */
export const downloadDispatchPdf = tenantAction(
  ['admin', 'dispatch', 'accounts'],
  dispatchIdInputSchema,
  async ({ tx, input, auth }): Promise<DispatchPdfDownload> => {
    const dispatch = await loadDispatchHeader(tx, input.id);
    if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found');

    let generatedId = (
      await getLatestGeneratedDocument(dispatch.tenantId, 'dispatch', input.id, tx)
    )?.id;
    if (!generatedId) {
      try {
        const rendered = await requestPdfRender(tx, {
          documentType: 'dispatch',
          documentId: input.id,
          tenantId: dispatch.tenantId,
          userId: auth.user.id,
        });
        generatedId = rendered.generatedDocumentId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'PDF generation failed';
        throw new AppError('INTERNAL', `Could not generate the dispatch note — ${message}`);
      }
    }

    const payload = await getGeneratedDocumentPayload(dispatch.tenantId, generatedId, tx);
    if (!payload) throw new AppError('NOT_FOUND', 'Generated document not found');

    await tx.insert(accessLog).values({
      tenantId: dispatch.tenantId,
      userId: auth.user.id,
      entityType: 'dispatch',
      entityId: input.id,
      action: 'download',
    });

    return {
      filename: payload.filename,
      mimeType: payload.mimeType,
      base64: payload.storage === 'inline' ? payload.storageRef : null,
      url: payload.storage === 'spaces' ? payload.storageRef : null,
    };
  },
);

/**
 * Email the dispatch note to the Ship-To (consignee) dealer — physical goods
 * follow the delivery location (CLAUDE.md §6). The PDF is rendered best-effort
 * and a `queued` email-delivery row is written for Day 14's Resend worker.
 */
export const emailDispatchPdf = tenantAction(
  ['admin', 'dispatch'],
  dispatchIdInputSchema,
  async ({ tx, input, auth }) => {
    const dispatch = await loadDispatchHeader(tx, input.id);
    if (!dispatch) throw new AppError('NOT_FOUND', 'Dispatch not found');

    const [dealer] = await tx
      .select({ email: dealers.email, name: dealers.displayName })
      .from(dealers)
      .where(eq(dealers.id, dispatch.shipToDealerId))
      .limit(1);
    if (!dealer?.email) {
      throw new AppError(
        'VALIDATION',
        'The Ship-To dealer has no email address on file — add one to send the dispatch note',
      );
    }

    // Render best-effort so the document is ready when the email worker sends.
    let dispatchDocId: string | null = null;
    try {
      const rendered = await requestPdfRender(tx, {
        documentType: 'dispatch',
        documentId: input.id,
        tenantId: dispatch.tenantId,
        userId: auth.user.id,
      });
      dispatchDocId = rendered.generatedDocumentId;
    } catch {
      // Swallowed by design — the email still goes out, sans attachment.
    }

    const [tenant] = await tx
      .select({ displayName: tenants.displayName })
      .from(tenants)
      .where(eq(tenants.id, dispatch.tenantId))
      .limit(1);
    const { html, text } = renderDocumentEmail({
      documentTitle: `Dispatch Note ${dispatch.dispatchNumber}`,
      senderName: tenant?.displayName ?? 'Dealerlink',
      intro: `Please find dispatch note ${dispatch.dispatchNumber} attached as a PDF.`,
    });

    const { emailLogId } = await queueEmail(tx, {
      tenantId: dispatch.tenantId,
      to: dealer.email,
      subject: `Dispatch Note ${dispatch.dispatchNumber}`,
      html,
      text,
      template: 'dispatch-note-pdf',
      ...(dispatchDocId ? { attachmentDocumentIds: [dispatchDocId] } : {}),
      extraMeta: { dispatchId: dispatch.id, dispatchNumber: dispatch.dispatchNumber },
    });

    return { id: input.id, emailLogId, queuedTo: dealer.email };
  },
);
