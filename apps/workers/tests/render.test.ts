/**
 * Smoke test for the Puppeteer render pipeline (chunk 10a).
 *
 * Renders trivial HTML to a PDF and asserts the output is a real PDF
 * buffer. Skips automatically when no Chromium executable is available
 * (e.g. a CI runner without Chrome / @sparticuz support) so the workers
 * test suite stays green everywhere.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { shutdownBrowser } from '../src/pdf/browser';
import { renderPdfFromHtml } from '../src/pdf/render';

function isNoChromium(err: unknown): boolean {
  return err instanceof Error && err.message.includes('No Chromium executable');
}

describe('renderPdfFromHtml', () => {
  afterAll(async () => {
    await shutdownBrowser();
  });

  it('renders trivial HTML to a non-empty PDF buffer', async (ctx) => {
    let pdf: Buffer;
    try {
      pdf = await renderPdfFromHtml('<h1>test</h1>');
    } catch (err) {
      if (isNoChromium(err)) {
        ctx.skip();
        return;
      }
      throw err;
    }
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.byteLength).toBeGreaterThan(0);
    // Every PDF file begins with the "%PDF-" magic bytes.
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 45_000);
});
