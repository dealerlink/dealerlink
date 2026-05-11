/**
 * Welcome email — sent to a newly provisioned tenant's admin user.
 *
 * NOTE: This is a plain-HTML template with inline styles rather than a
 * `react-email` component. Day 4 ships the operator-provisioning flow; the
 * react-email package can be introduced when the second email template
 * (e.g., password reset, quotation delivery) lands — at that point the
 * boilerplate of a shared MJML-ish framework pays for itself. The inline
 * styles below mirror the design tokens in `apps/web/app/globals.css` so a
 * future port is mechanical.
 */
export interface TenantWelcomeProps {
  tenantDisplayName: string;
  adminFullName: string;
  adminEmail: string;
  loginUrl: string;
  temporaryPassword: string;
}

export interface RenderedEmail {
  subject: string;
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

export function renderTenantWelcome(props: TenantWelcomeProps): RenderedEmail {
  const { tenantDisplayName, adminFullName, adminEmail, loginUrl, temporaryPassword } = props;

  const subject = `Welcome to Dealerlink — ${tenantDisplayName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f7f7f4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif; color:#0b0f1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f4;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background:#ffffff; box-shadow: inset 0 0 0 1px #e3e3dc; border-radius:8px;">
            <tr>
              <td style="padding:32px 32px 16px 32px;">
                <div style="font-size:10.5px; letter-spacing:0.14em; text-transform:uppercase; color:#6b7280; font-weight:500;">DEALERLINK</div>
                <h1 style="margin:6px 0 0 0; font-size:24px; font-weight:600; letter-spacing:-0.02em; color:#0b0f1a;">
                  Your workspace is ready
                </h1>
                <p style="margin:8px 0 0 0; font-size:14px; line-height:1.5; color:#1a2030;">
                  Hi ${escapeHtml(adminFullName.split(' ')[0] ?? adminFullName)}, your tenant
                  <strong>${escapeHtml(tenantDisplayName)}</strong> has been provisioned on Dealerlink.
                  Use the credentials below to sign in. You'll be asked to set a permanent password on first login.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 16px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfbf8; border-radius:6px; box-shadow: inset 0 0 0 1px #e3e3dc;">
                  <tr>
                    <td style="padding:16px 20px;">
                      <div style="font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:#6b7280; font-weight:500;">Credentials</div>
                      <div style="margin-top:8px; font-size:13px;">
                        <div style="margin-bottom:6px;">
                          <span style="color:#6b7280;">Email&nbsp;</span>
                          <span style="font-family: 'IBM Plex Mono', SFMono-Regular, Menlo, monospace; color:#0b0f1a;">${escapeHtml(adminEmail)}</span>
                        </div>
                        <div>
                          <span style="color:#6b7280;">Temporary password&nbsp;</span>
                          <span style="font-family: 'IBM Plex Mono', SFMono-Regular, Menlo, monospace; color:#0b0f1a; background:#ffffff; padding:2px 6px; border-radius:3px; box-shadow: inset 0 0 0 1px #e3e3dc;">${escapeHtml(temporaryPassword)}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px 32px;">
                <a href="${escapeHtml(loginUrl)}" style="display:inline-block; background:#3730a3; color:#ffffff; text-decoration:none; padding:10px 16px; border-radius:6px; font-size:13px; font-weight:500;">
                  Sign in to ${escapeHtml(tenantDisplayName)}
                </a>
                <div style="margin-top:10px; font-size:12px; color:#6b7280;">
                  Or open this link directly: <span style="font-family: 'IBM Plex Mono', SFMono-Regular, Menlo, monospace;">${escapeHtml(loginUrl)}</span>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px 32px; font-size:12px; line-height:1.55; color:#6b7280;">
                <p style="margin:0 0 8px 0;">
                  For security, the temporary password expires after first use. If you didn't expect
                  this email, please reply to it and we'll investigate.
                </p>
                <p style="margin:0;">
                  Dealerlink · Operator-provisioned workspace · ${new Date().getFullYear()}
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
    `Welcome to Dealerlink — ${tenantDisplayName}`,
    '',
    `Hi ${adminFullName.split(' ')[0] ?? adminFullName},`,
    '',
    `Your tenant ${tenantDisplayName} has been provisioned. Sign in at:`,
    loginUrl,
    '',
    `Email:     ${adminEmail}`,
    `Password:  ${temporaryPassword}`,
    '',
    `You'll be asked to set a permanent password on first login.`,
    '',
    `If you didn't expect this email, please reply — Dealerlink support.`,
  ].join('\n');

  return { subject, html, text };
}
