'use server';

import { emailDeliveryLog } from '@dealerlink/db';
import { z } from 'zod';

import { tenantAction } from '@/lib/actions/wrap';
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
 * Queue a quotation PDF for delivery to a dealer.
 *
 * Day 10 GENERATES the PDF and records the request in `email_delivery_log`
 * (status 'queued'); the actual Resend send is wired in Day 14 when the
 * email worker lands. The PDF is produced regardless so it is ready to
 * attach the moment delivery is enabled.
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

    await tx.insert(emailDeliveryLog).values({
      tenantId: existing.tenantId,
      recipient: input.recipient,
      subject: input.subject,
      template: 'quotation-pdf',
      status: 'queued',
      meta: {
        quotationId: input.id,
        quoteNumber: existing.quoteNumber,
        generatedDocumentId: generatedId,
        body: input.body ?? null,
        // Day 14: the email worker reads this row, attaches the PDF, sends
        // via Resend, and flips status to 'sent'.
        pendingSend: true,
      },
    });

    return { queued: true, generatedDocumentId: generatedId };
  },
);
