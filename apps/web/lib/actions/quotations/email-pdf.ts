'use server';

import { tenants } from '@dealerlink/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { tenantAction } from '@/lib/actions/wrap';
import { queueEmail } from '@/lib/email/send';
import { renderDocumentEmail } from '@/lib/email/templates/document-delivery';
import { AppError } from '@/lib/errors';
import { getLatestGeneratedDocument } from '@/lib/queries/generated-documents';
import { spawnPdfRender } from '@/lib/pdf/spawn-render';

import { loadQuotationForGuard } from './helpers';

const emailPdfSchema = z.object({
  id: z.string().uuid(),
  recipient: z.string().email('Enter a valid email address'),
  subject: z.string().min(1, 'Subject is required').max(200),
  body: z.string().max(4000).optional(),
});

/**
 * Email a quotation PDF to a dealer (R.13 — async via pg-boss).
 *
 * Renders the PDF if it does not exist yet, then `queueEmail` writes a
 * `queued` email_delivery_log row and enqueues the `send-email` job. The
 * worker attaches the PDF (from generated_documents) and calls Resend.
 * This action does NOT await delivery — the UI shows "queued".
 */
export const emailQuotationPdf = tenantAction(
  ['admin', 'sales'],
  emailPdfSchema,
  async ({ tx, input, auth }) => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');

    let generatedId = (
      await getLatestGeneratedDocument(existing.tenantId, 'quotation', input.id, tx)
    )?.id;
    if (!generatedId) {
      try {
        const rendered = await spawnPdfRender({
          documentType: 'quotation',
          documentId: input.id,
          tenantId: existing.tenantId,
          userId: auth.user.id,
        });
        generatedId = rendered.generatedDocumentId;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'PDF generation failed';
        throw new AppError('INTERNAL', `Could not generate the PDF — ${message}`);
      }
    }

    const [tenant] = await tx
      .select({ displayName: tenants.displayName })
      .from(tenants)
      .where(eq(tenants.id, existing.tenantId))
      .limit(1);
    const senderName = tenant?.displayName ?? 'Dealerlink';

    const { html, text } = renderDocumentEmail({
      documentTitle: `Quotation ${existing.quoteNumber}`,
      senderName,
      intro: `Please find quotation ${existing.quoteNumber} attached as a PDF.`,
      customMessage: input.body ?? null,
    });

    const { emailLogId } = await queueEmail(tx, {
      tenantId: existing.tenantId,
      to: input.recipient,
      subject: input.subject,
      html,
      text,
      template: 'quotation-pdf',
      attachmentDocumentIds: [generatedId],
      extraMeta: { quotationId: input.id, quoteNumber: existing.quoteNumber },
    });

    return { queued: true, emailLogId, generatedDocumentId: generatedId };
  },
);
