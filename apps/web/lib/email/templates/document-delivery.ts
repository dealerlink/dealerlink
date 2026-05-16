/**
 * Generic transactional email body for "here is your <document>" mails —
 * quotation, performa invoice, payment receipt, dispatch note.
 *
 * The PDF itself rides as an attachment (assembled by the email worker from
 * `generated_documents`); this template is just the covering message. Inline
 * styles mirror the design tokens, matching `tenant-welcome.ts`.
 */
export interface DocumentEmailProps {
  /** e.g. "Quotation QT-2026-0042". */
  documentTitle: string;
  /** Tenant display name — the sender, shown in the sign-off. */
  senderName: string;
  /** One-line description of what is attached. */
  intro: string;
  /** Optional free-text note typed by the sender. */
  customMessage?: string | null;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderDocumentEmail(props: DocumentEmailProps): RenderedEmail {
  const { documentTitle, senderName, intro, customMessage } = props;
  const note = customMessage?.trim();

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(documentTitle)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f7f7f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif; color:#0b0f1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f4;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background:#ffffff; box-shadow: inset 0 0 0 1px #e3e3dc; border-radius:8px;">
            <tr>
              <td style="padding:32px 32px 24px 32px;">
                <div style="font-size:10.5px; letter-spacing:0.14em; text-transform:uppercase; color:#6b7280; font-weight:500;">${escapeHtml(senderName)}</div>
                <h1 style="margin:6px 0 0 0; font-size:22px; font-weight:600; letter-spacing:-0.02em; color:#0b0f1a;">
                  ${escapeHtml(documentTitle)}
                </h1>
                <p style="margin:12px 0 0 0; font-size:14px; line-height:1.5; color:#1a2030;">
                  ${escapeHtml(intro)}
                </p>
                ${
                  note
                    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px; background:#fbfbf8; border-radius:6px; box-shadow: inset 0 0 0 1px #e3e3dc;">
                  <tr><td style="padding:14px 18px; font-size:13px; line-height:1.55; color:#1a2030; white-space:pre-wrap;">${escapeHtml(note)}</td></tr>
                </table>`
                    : ''
                }
                <p style="margin:18px 0 0 0; font-size:12px; line-height:1.55; color:#6b7280;">
                  The document is attached as a PDF. If you didn't expect this email,
                  please reply to it and we'll investigate.
                </p>
                <p style="margin:10px 0 0 0; font-size:12px; color:#6b7280;">
                  ${escapeHtml(senderName)} · Sent via Dealerlink · ${new Date().getFullYear()}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    documentTitle,
    '',
    intro,
    ...(note ? ['', note] : []),
    '',
    'The document is attached as a PDF.',
    '',
    `${senderName} · Sent via Dealerlink`,
  ].join('\n');

  return { html, text };
}
