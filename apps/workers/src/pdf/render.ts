/**
 * Pure HTML → PDF rendering.
 *
 * `renderPdfFromHtml` is the single choke point that touches Puppeteer's
 * page API. Everything above it (templates, job handlers) deals in plain
 * HTML strings and `Buffer`s, so it is trivially testable and swappable.
 *
 * The header/footer band is baked into the template HTML itself
 * (`displayHeaderFooter: false`) — Puppeteer's native header/footer template
 * is too limited for the tenant-branded layout Day 10 needs.
 */
import { getBrowser, notePageOpened } from './browser';

export interface PdfMargin {
  top: string;
  bottom: string;
  left: string;
  right: string;
}

export interface PdfOptions {
  /** Paper format. Default: A4. */
  format?: 'A4' | 'Letter' | 'Legal';
  /** Page margins. Default: 18mm on every side. */
  margin?: Partial<PdfMargin>;
  /** Render CSS backgrounds/colours. Default: true. */
  printBackground?: boolean;
  /** Hard cap on render time. Default: 30_000ms (docs/PDF_PIPELINE.md). */
  timeoutMs?: number;
}

const DEFAULT_MARGIN: PdfMargin = {
  top: '18mm',
  bottom: '18mm',
  left: '18mm',
  right: '18mm',
};

/**
 * Render a complete HTML document to a PDF buffer.
 *
 * The HTML must be self-contained — all CSS inline, no external stylesheet
 * or remote font links that could stall `setContent`. Images may be remote
 * (Spaces URLs) or data URIs; `networkidle0` waits for them to settle.
 */
export async function renderPdfFromHtml(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const browser = await getBrowser();
  const page = await browser.newPage();
  notePageOpened();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: timeoutMs });
    const pdf = await page.pdf({
      format: opts.format ?? 'A4',
      printBackground: opts.printBackground ?? true,
      displayHeaderFooter: false,
      preferCSSPageSize: false,
      margin: { ...DEFAULT_MARGIN, ...opts.margin },
      timeout: timeoutMs,
    });
    return Buffer.from(pdf);
  } finally {
    // Always close the page, even if .pdf() threw — a leaked page is a
    // leaked renderer process.
    await page.close().catch(() => undefined);
  }
}
