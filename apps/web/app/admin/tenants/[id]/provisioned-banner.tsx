'use client';

import { useEffect, useState } from 'react';

import { CheckCircle2, Copy, KeyRound } from 'lucide-react';

interface Credentials {
  tenantId: string;
  adminEmail: string;
  temporaryPassword: string;
  loginUrl: string;
}

/**
 * Shown once on the tenant detail page after provisioning. Reads the
 * credentials from sessionStorage (set by the create form) and offers
 * copy-to-clipboard. The credentials are also in the welcome email, so
 * clearing on reload is acceptable — even desirable, since they're
 * single-use.
 */
export function ProvisionedBanner({ tenantId }: { tenantId: string }) {
  const [creds, setCreds] = useState<Credentials | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('dl_tenant_credentials');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Credentials;
      if (parsed.tenantId !== tenantId) return;
      setCreds(parsed);
      sessionStorage.removeItem('dl_tenant_credentials');
    } catch {
      // Ignore — credentials are also in the welcome email.
    }
  }, [tenantId]);

  if (!creds) {
    return (
      <div className="mt-6 rounded-[8px] border border-[var(--emerald)] bg-[#ecfdf5] p-4 text-[13px] text-[var(--emerald)]">
        <div className="flex items-center gap-2 font-medium">
          <CheckCircle2 size={14} />
          Tenant created. The welcome email is on its way.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-[8px] border border-[var(--emerald)] bg-[#ecfdf5] p-5">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-[var(--emerald)]">
        <CheckCircle2 size={15} />
        Tenant created — temporary credentials (shown once)
      </div>
      <p className="text-mute mt-1 text-[12.5px]">
        These credentials were also queued to a welcome email. The admin user will be forced to
        rotate the password on first login.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <CopyRow label="Admin email" value={creds.adminEmail} />
        <CopyRow
          label="Temporary password"
          value={creds.temporaryPassword}
          mono
          icon={<KeyRound size={11} />}
        />
        <CopyRow label="Login URL" value={creds.loginUrl} className="md:col-span-2" />
      </div>
    </div>
  );
}

function CopyRow({
  label,
  value,
  mono,
  className,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
  icon?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`hairline rounded-[6px] bg-white px-3 py-2 ${className ?? ''}`}>
      <div className="text-mute flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.08em]">
        {icon}
        {label}
      </div>
      <div className="mt-1 flex items-center justify-between gap-3">
        <span className={`break-all text-[13px] ${mono ? 'mono' : ''}`}>{value}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Clipboard unavailable; user can still select the text.
            }
          }}
          className="text-mute hover:text-ink inline-flex items-center gap-1 rounded-[4px] px-1.5 py-1 text-[11px]"
          aria-label={`Copy ${label}`}
        >
          <Copy size={11} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
