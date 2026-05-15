'use server';

import { z } from 'zod';

import { tenantAction } from '@/lib/actions/wrap';
import { AppError } from '@/lib/errors';
import { spawnPdfRender } from '@/lib/pdf/spawn-render';

import { loadQuotationForGuard } from './helpers';

const generatePdfSchema = z.object({ id: z.string().uuid() });

/**
 * Render (or re-render) a quotation to PDF.
 *
 * Day 10 runs the render synchronously by spawning the workers `render-cli`
 * subprocess (DEV.36) — Puppeteer never enters the web process. Each call
 * produces a NEW immutable `generated_documents` row; the download path
 * always serves the most recent one.
 *
 * The `revalidatePath` is intentionally omitted — callers (`QuotationActions`)
 * `router.refresh()` after a successful generate.
 */
export const generateQuotationPdf = tenantAction(
  ['admin', 'sales'],
  generatePdfSchema,
  async ({ tx, input, auth }) => {
    const existing = await loadQuotationForGuard(tx, input.id);
    if (!existing) throw new AppError('NOT_FOUND', 'Quotation not found');

    try {
      const result = await spawnPdfRender({
        documentType: 'quotation',
        documentId: input.id,
        tenantId: existing.tenantId,
        userId: auth.user.id,
      });
      return {
        documentId: result.generatedDocumentId,
        filename: result.filename,
        sizeBytes: result.sizeBytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'PDF generation failed';
      throw new AppError('INTERNAL', `Could not generate the PDF — ${message}`);
    }
  },
);
