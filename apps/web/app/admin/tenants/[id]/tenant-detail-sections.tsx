'use client';

import * as React from 'react';
import { useState, useTransition } from 'react';

import {
  AtSign,
  Building2,
  CircleAlert,
  Cog,
  CreditCard,
  Image as ImageIcon,
  MapPin,
  PencilLine,
  RotateCw,
  Save,
  Shield,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import { regenerateInboundToken } from '@/lib/actions/admin/inbound-token';
import {
  updateTenantAddress,
  updateTenantBank,
  updateTenantBranding,
  updateTenantCompliance,
  updateTenantDefaults,
  updateTenantDocPrefixes,
  updateTenantIdentity,
} from '@/lib/actions/admin/update-tenant';
import { INDIAN_STATES } from '@/lib/admin/constants';

interface TenantSummary {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  status: string;
}

export interface TenantSettingsView {
  gstin: string | null;
  pan: string | null;
  state: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPincode: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  bankBranch: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  docPrefixes: Record<string, string> | null;
  defaultQuoteValidity: number;
  defaultCreditPeriod: number;
  lowStockThreshold: number;
  defaultTerms: string | null;
  inboundEmailToken: string | null;
}

interface TokenHistory {
  activeRetiredCount: number;
  recent: { tokenMasked: string; retiredAt: string; expiresAt: string }[];
}

interface Props {
  tenant: TenantSummary;
  settings: TenantSettingsView | null;
  tokenHistory: TokenHistory;
}

export function TenantDetailSections({ tenant, settings, tokenHistory }: Props) {
  const router = useRouter();
  const refresh = () => router.refresh();

  if (!settings) {
    return (
      <div className="text-mute mt-6 text-[13px]">
        Tenant settings row is missing — this tenant predates the Day 4 schema. Recreate via the
        operator app.
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <IdentitySection tenant={tenant} onSaved={refresh} />
      <ComplianceSection tenant={tenant} settings={settings} onSaved={refresh} />
      <AddressSection tenant={tenant} settings={settings} onSaved={refresh} />
      <BankSection tenant={tenant} settings={settings} onSaved={refresh} />
      <BrandingSection tenant={tenant} settings={settings} onSaved={refresh} />
      <DocPrefixesSection tenant={tenant} settings={settings} onSaved={refresh} />
      <DefaultsSection tenant={tenant} settings={settings} onSaved={refresh} />
      <InboundTokenSection
        tenant={tenant}
        settings={settings}
        tokenHistory={tokenHistory}
        onChanged={refresh}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section primitives
// ---------------------------------------------------------------------------

function SectionFrame({
  title,
  icon,
  editing,
  onEdit,
  onCancel,
  onSubmit,
  pending,
  children,
  danger,
}: {
  title: string;
  icon: React.ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <section
      className={`rounded-[8px] bg-white p-5 ${
        danger ? 'border border-[var(--rose)]' : 'hairline'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-mute">{icon}</span>
          <div className="titlecaps">{title}</div>
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="text-mute hover:text-ink inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px]"
            >
              <X size={12} />
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending}
              className="border-accent bg-accent inline-flex h-7 items-center gap-1 rounded-[5px] border px-2 text-[12px] font-medium text-white hover:bg-[var(--accent-2)] disabled:opacity-60"
            >
              <Save size={11} />
              {pending ? 'Saving…' : 'Save'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onEdit}
            className="text-mute hover:text-ink inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px]"
          >
            <PencilLine size={11} />
            Edit
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

const inputClass =
  'border-line text-ink placeholder:text-mute focus:ring-accent focus:border-accent flex h-[32px] w-full rounded-[5px] border bg-white px-3 text-[13px] focus:outline-none focus:ring-1';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] items-center gap-x-3 py-1.5 text-[13px]">
      <div className="text-mute text-[12px]">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function FieldError({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="mt-1 flex items-center gap-1 text-[12px] text-[var(--rose)]">
      <CircleAlert size={11} /> {msg}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

function IdentitySection({ tenant, onSaved }: { tenant: TenantSummary; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(tenant.slug);
  const [legalName, setLegalName] = useState(tenant.legalName);
  const [displayName, setDisplayName] = useState(tenant.displayName);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const slugChanged = slug !== tenant.slug;

  return (
    <SectionFrame
      title="Identity"
      icon={<Building2 size={13} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setSlug(tenant.slug);
        setLegalName(tenant.legalName);
        setDisplayName(tenant.displayName);
        setError(null);
      }}
      onSubmit={() => {
        setError(null);
        startTransition(async () => {
          const result = await updateTenantIdentity({
            id: tenant.id,
            slug,
            legalName,
            displayName,
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setEditing(false);
          onSaved();
        });
      }}
      pending={pending}
    >
      {editing ? (
        <div className="space-y-2">
          <Row label="Slug">
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              className={inputClass}
              autoComplete="off"
            />
          </Row>
          <Row label="Legal name">
            <input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className={inputClass}
            />
          </Row>
          <Row label="Display name">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </Row>
          {slugChanged ? (
            <div className="mt-2 rounded-[5px] border border-[var(--amber)] bg-[#fffbeb] px-3 py-2 text-[12px] text-[var(--amber)]">
              ⚠ Changing the slug renames the tenant workspace URL ({slug}.dealerlink.in),
              invalidates bookmarks, and breaks existing BCC instructions. Users will need to update
              inbound email addresses.
            </div>
          ) : null}
          <FieldError msg={error} />
        </div>
      ) : (
        <dl>
          <Row label="Slug">
            <span className="mono">{tenant.slug}.dealerlink.in</span>
          </Row>
          <Row label="Legal name">{tenant.legalName}</Row>
          <Row label="Display name">{tenant.displayName}</Row>
          <Row label="Status">
            <span className="capitalize">{tenant.status}</span>
          </Row>
        </dl>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

function ComplianceSection({
  tenant,
  settings,
  onSaved,
}: {
  tenant: TenantSummary;
  settings: TenantSettingsView;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [gstin, setGstin] = useState(settings.gstin ?? '');
  const [pan, setPan] = useState(settings.pan ?? '');
  const [state, setState] = useState(settings.state ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <SectionFrame
      title="Compliance"
      icon={<Shield size={13} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setGstin(settings.gstin ?? '');
        setPan(settings.pan ?? '');
        setState(settings.state ?? '');
        setError(null);
      }}
      onSubmit={() => {
        setError(null);
        startTransition(async () => {
          const result = await updateTenantCompliance({
            id: tenant.id,
            gstin: gstin.toUpperCase(),
            pan: pan.toUpperCase(),
            // state is constrained server-side; cast is checked at runtime by zod
            state: state as (typeof INDIAN_STATES)[number],
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setEditing(false);
          onSaved();
        });
      }}
      pending={pending}
    >
      {editing ? (
        <div className="space-y-2">
          <Row label="GSTIN">
            <input
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              className={`${inputClass} mono`}
            />
          </Row>
          <Row label="PAN">
            <input
              value={pan}
              onChange={(e) => setPan(e.target.value.toUpperCase())}
              maxLength={10}
              className={`${inputClass} mono`}
            />
          </Row>
          <Row label="State (tax)">
            <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
              <option value="">Select…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
          <FieldError msg={error} />
        </div>
      ) : (
        <dl>
          <Row label="GSTIN">
            <span className="mono">{settings.gstin ?? '—'}</span>
          </Row>
          <Row label="PAN">
            <span className="mono">{settings.pan ?? '—'}</span>
          </Row>
          <Row label="State (tax)">{settings.state ?? '—'}</Row>
        </dl>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

function AddressSection({
  tenant,
  settings,
  onSaved,
}: {
  tenant: TenantSummary;
  settings: TenantSettingsView;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [line1, setLine1] = useState(settings.addressLine1 ?? '');
  const [line2, setLine2] = useState(settings.addressLine2 ?? '');
  const [city, setCity] = useState(settings.addressCity ?? '');
  const [state, setState] = useState(settings.addressState ?? '');
  const [pincode, setPincode] = useState(settings.addressPincode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <SectionFrame
      title="Registered address"
      icon={<MapPin size={13} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setLine1(settings.addressLine1 ?? '');
        setLine2(settings.addressLine2 ?? '');
        setCity(settings.addressCity ?? '');
        setState(settings.addressState ?? '');
        setPincode(settings.addressPincode ?? '');
        setError(null);
      }}
      onSubmit={() => {
        setError(null);
        startTransition(async () => {
          const result = await updateTenantAddress({
            id: tenant.id,
            addressLine1: line1,
            addressLine2: line2,
            addressCity: city,
            addressState: state as (typeof INDIAN_STATES)[number],
            addressPincode: pincode,
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setEditing(false);
          onSaved();
        });
      }}
      pending={pending}
    >
      {editing ? (
        <div className="space-y-2">
          <Row label="Address line 1">
            <input
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              className={inputClass}
            />
          </Row>
          <Row label="Address line 2">
            <input
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              className={inputClass}
            />
          </Row>
          <Row label="City">
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </Row>
          <Row label="Pincode">
            <input
              value={pincode}
              onChange={(e) => setPincode(e.target.value)}
              maxLength={6}
              className={`${inputClass} mono`}
            />
          </Row>
          <Row label="State">
            <select value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
              <option value="">Select…</option>
              {INDIAN_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
          <FieldError msg={error} />
        </div>
      ) : (
        <dl>
          <Row label="Line 1">{settings.addressLine1 ?? '—'}</Row>
          <Row label="Line 2">{settings.addressLine2 ?? '—'}</Row>
          <Row label="City">{settings.addressCity ?? '—'}</Row>
          <Row label="Pincode">
            <span className="mono">{settings.addressPincode ?? '—'}</span>
          </Row>
          <Row label="State">{settings.addressState ?? '—'}</Row>
        </dl>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
// Bank
// ---------------------------------------------------------------------------

function BankSection({
  tenant,
  settings,
  onSaved,
}: {
  tenant: TenantSummary;
  settings: TenantSettingsView;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(settings.bankAccountName ?? '');
  const [account, setAccount] = useState(settings.bankAccountNumber ?? '');
  const [ifsc, setIfsc] = useState(settings.bankIfsc ?? '');
  const [branch, setBranch] = useState(settings.bankBranch ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <SectionFrame
      title="Bank (printed on invoices)"
      icon={<CreditCard size={13} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setName(settings.bankAccountName ?? '');
        setAccount(settings.bankAccountNumber ?? '');
        setIfsc(settings.bankIfsc ?? '');
        setBranch(settings.bankBranch ?? '');
        setError(null);
      }}
      onSubmit={() => {
        setError(null);
        startTransition(async () => {
          const result = await updateTenantBank({
            id: tenant.id,
            bankAccountName: name,
            bankAccountNumber: account,
            bankIfsc: ifsc.toUpperCase(),
            bankBranch: branch,
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setEditing(false);
          onSaved();
        });
      }}
      pending={pending}
    >
      {editing ? (
        <div className="space-y-2">
          <Row label="Account name">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Row>
          <Row label="Account number">
            <input
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className={`${inputClass} mono`}
              inputMode="numeric"
            />
          </Row>
          <Row label="IFSC">
            <input
              value={ifsc}
              onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              maxLength={11}
              className={`${inputClass} mono`}
            />
          </Row>
          <Row label="Branch">
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className={inputClass}
            />
          </Row>
          <FieldError msg={error} />
        </div>
      ) : (
        <dl>
          <Row label="Account name">{settings.bankAccountName ?? '—'}</Row>
          <Row label="Account number">
            <span className="mono">{settings.bankAccountNumber ?? '—'}</span>
          </Row>
          <Row label="IFSC">
            <span className="mono">{settings.bankIfsc ?? '—'}</span>
          </Row>
          <Row label="Branch">{settings.bankBranch ?? '—'}</Row>
        </dl>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

function BrandingSection({
  tenant,
  settings,
  onSaved,
}: {
  tenant: TenantSummary;
  settings: TenantSettingsView;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    if (file.size > 1024 * 1024) {
      setError('Logo must be 1 MB or smaller');
      return;
    }
    const ok = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!ok.includes(file.type)) {
      setError('Use PNG, JPG, or SVG');
      return;
    }
    setUploading(true);
    try {
      // SVG sanitization happens on the server when storage is wired; for
      // the base64-fallback path, we only accept SVGs from a trusted
      // operator and the value is rendered into <img src="data:..."> which
      // does not execute embedded scripts in modern browsers. Still, we
      // strip the `<script>` element here as a defence-in-depth.
      let dataUrl: string;
      if (file.type === 'image/svg+xml') {
        const raw = await file.text();
        const cleaned = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(cleaned)))}`;
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });
      }
      setLogoUrl(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load file');
    } finally {
      setUploading(false);
    }
  };

  return (
    <SectionFrame
      title="Branding"
      icon={<ImageIcon size={13} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setLogoUrl(settings.logoUrl ?? '');
        setPrimaryColor(settings.primaryColor ?? '');
        setError(null);
      }}
      onSubmit={() => {
        setError(null);
        startTransition(async () => {
          const result = await updateTenantBranding({
            id: tenant.id,
            logoUrl,
            primaryColor,
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setEditing(false);
          onSaved();
        });
      }}
      pending={pending}
    >
      {editing ? (
        <div className="space-y-3">
          <Row label="Logo file">
            <div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
                className="text-[12.5px]"
              />
              <div className="text-mute mt-1 text-[11.5px]">
                Max 1 MB · PNG, JPG, SVG · recommended 400×120 px
              </div>
              {!process.env.NEXT_PUBLIC_DO_SPACES_CONFIGURED ? (
                <div className="mt-2 text-[11.5px] text-[var(--amber)]">
                  ⓘ DO Spaces is not configured; storing as base64 in tenant_settings.logo_url for
                  development.
                </div>
              ) : null}
            </div>
          </Row>
          {logoUrl ? (
            <Row label="Preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo preview"
                style={{ maxHeight: 60, maxWidth: 220 }}
                className="hairline rounded-[4px] bg-white"
              />
            </Row>
          ) : null}
          <Row label="Logo URL">
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://… or data:image/…"
              className={inputClass}
            />
          </Row>
          <Row label="Primary color">
            <input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#3730A3"
              className={`${inputClass} mono`}
            />
          </Row>
          {uploading ? <div className="text-mute text-[12px]">Reading file…</div> : null}
          <FieldError msg={error} />
        </div>
      ) : (
        <dl>
          <Row label="Logo">
            {settings.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logoUrl}
                alt="Logo"
                style={{ maxHeight: 32, maxWidth: 160 }}
                className="hairline rounded-[4px] bg-white"
              />
            ) : (
              <span className="text-mute">— (not set)</span>
            )}
          </Row>
          <Row label="Primary color">
            {settings.primaryColor ? (
              <span className="inline-flex items-center gap-2">
                <span
                  style={{ background: settings.primaryColor }}
                  className="border-line h-4 w-4 rounded-[3px] border"
                />
                <span className="mono">{settings.primaryColor}</span>
              </span>
            ) : (
              <span className="text-mute">— (uses platform accent)</span>
            )}
          </Row>
        </dl>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
// Document prefixes
// ---------------------------------------------------------------------------

function DocPrefixesSection({
  tenant,
  settings,
  onSaved,
}: {
  tenant: TenantSummary;
  settings: TenantSettingsView;
  onSaved: () => void;
}) {
  const initial = settings.docPrefixes ?? {
    quotation: 'QT',
    proforma: 'PI',
    order: 'ORD',
    invoice: 'INV',
    payment: 'PAY',
    dispatch: 'DSP',
  };
  const [editing, setEditing] = useState(false);
  const [prefixes, setPrefixes] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const keys: { key: keyof typeof initial; label: string }[] = [
    { key: 'quotation', label: 'Quotation' },
    { key: 'proforma', label: 'Proforma invoice' },
    { key: 'order', label: 'Order' },
    { key: 'invoice', label: 'Tax invoice' },
    { key: 'payment', label: 'Payment' },
    { key: 'dispatch', label: 'Dispatch' },
  ];

  return (
    <SectionFrame
      title="Document prefixes"
      icon={<AtSign size={13} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setPrefixes(initial);
        setError(null);
      }}
      onSubmit={() => {
        setError(null);
        startTransition(async () => {
          const result = await updateTenantDocPrefixes({
            id: tenant.id,
            docPrefixes: prefixes,
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setEditing(false);
          onSaved();
        });
      }}
      pending={pending}
    >
      {editing ? (
        <div className="space-y-2">
          {keys.map((k) => (
            <Row key={k.key} label={k.label}>
              <input
                value={prefixes[k.key] ?? ''}
                onChange={(e) =>
                  setPrefixes({ ...prefixes, [k.key]: e.target.value.toUpperCase() })
                }
                maxLength={8}
                className={`${inputClass} mono`}
              />
            </Row>
          ))}
          <FieldError msg={error} />
        </div>
      ) : (
        <dl>
          {keys.map((k) => (
            <Row key={k.key} label={k.label}>
              <span className="mono">{initial[k.key]}-FY-####</span>
            </Row>
          ))}
        </dl>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function DefaultsSection({
  tenant,
  settings,
  onSaved,
}: {
  tenant: TenantSummary;
  settings: TenantSettingsView;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [quoteValidity, setQuoteValidity] = useState(String(settings.defaultQuoteValidity));
  const [creditPeriod, setCreditPeriod] = useState(String(settings.defaultCreditPeriod));
  const [lowStock, setLowStock] = useState(String(settings.lowStockThreshold));
  const [terms, setTerms] = useState(settings.defaultTerms ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <SectionFrame
      title="Defaults"
      icon={<Cog size={13} />}
      editing={editing}
      onEdit={() => setEditing(true)}
      onCancel={() => {
        setEditing(false);
        setQuoteValidity(String(settings.defaultQuoteValidity));
        setCreditPeriod(String(settings.defaultCreditPeriod));
        setLowStock(String(settings.lowStockThreshold));
        setTerms(settings.defaultTerms ?? '');
        setError(null);
      }}
      onSubmit={() => {
        setError(null);
        startTransition(async () => {
          const result = await updateTenantDefaults({
            id: tenant.id,
            defaultQuoteValidity: Number(quoteValidity),
            defaultCreditPeriod: Number(creditPeriod),
            lowStockThreshold: Number(lowStock),
            defaultTerms: terms,
          });
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          setEditing(false);
          onSaved();
        });
      }}
      pending={pending}
    >
      {editing ? (
        <div className="space-y-2">
          <Row label="Quote validity (days)">
            <input
              value={quoteValidity}
              onChange={(e) => setQuoteValidity(e.target.value)}
              className={`${inputClass} mono`}
              inputMode="numeric"
            />
          </Row>
          <Row label="Credit period (days)">
            <input
              value={creditPeriod}
              onChange={(e) => setCreditPeriod(e.target.value)}
              className={`${inputClass} mono`}
              inputMode="numeric"
            />
          </Row>
          <Row label="Low-stock threshold">
            <input
              value={lowStock}
              onChange={(e) => setLowStock(e.target.value)}
              className={`${inputClass} mono`}
              inputMode="numeric"
            />
          </Row>
          <Row label="Default T&C">
            <textarea
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              rows={3}
              className="border-line focus:ring-accent focus:border-accent w-full rounded-[5px] border bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-1"
            />
          </Row>
          <FieldError msg={error} />
        </div>
      ) : (
        <dl>
          <Row label="Quote validity">
            <span className="mono">{settings.defaultQuoteValidity} days</span>
          </Row>
          <Row label="Credit period">
            <span className="mono">{settings.defaultCreditPeriod} days</span>
          </Row>
          <Row label="Low-stock threshold">
            <span className="mono">{settings.lowStockThreshold}</span>
          </Row>
          <Row label="Default T&C">
            {settings.defaultTerms ? (
              <span className="text-[12.5px]">{settings.defaultTerms}</span>
            ) : (
              <span className="text-mute">— (not set)</span>
            )}
          </Row>
        </dl>
      )}
    </SectionFrame>
  );
}

// ---------------------------------------------------------------------------
// Inbound token
// ---------------------------------------------------------------------------

function InboundTokenSection({
  tenant,
  settings,
  tokenHistory,
  onChanged,
}: {
  tenant: TenantSummary;
  settings: TenantSettingsView;
  tokenHistory: TokenHistory;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const address = settings.inboundEmailToken
    ? `${tenant.slug}+${settings.inboundEmailToken}@mail.dealerlink.in`
    : '(not configured)';

  const rotate = () => {
    setError(null);
    startTransition(async () => {
      const result = await regenerateInboundToken({ tenantId: tenant.id });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setConfirming(false);
      onChanged();
    });
  };

  return (
    <section className="hairline rounded-[8px] bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-mute">
            <RotateCw size={13} />
          </span>
          <div className="titlecaps">Inbound email token</div>
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-mute hover:text-ink inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-[12px]"
          >
            <RotateCw size={11} /> Regenerate
          </button>
        ) : null}
      </div>
      <Row label="Address">
        <span className="mono break-all">{address}</span>
      </Row>
      <Row label="Retired tokens">
        <span className="text-[12.5px]">
          {tokenHistory.activeRetiredCount > 0
            ? `${tokenHistory.activeRetiredCount} still in 7-day grace window`
            : 'None active'}
        </span>
      </Row>
      {tokenHistory.recent.length > 0 ? (
        <div className="mt-2">
          <div className="titlecaps mb-1">Recent rotations</div>
          <ul className="text-[12px]">
            {tokenHistory.recent.map((h, i) => (
              <li key={i} className="text-mute flex items-center gap-2 py-0.5 font-mono">
                <span className="mono">{h.tokenMasked}</span>
                <span>·</span>
                <span>retired {new Date(h.retiredAt).toLocaleDateString('en-IN')}</span>
                <span>·</span>
                <span>
                  {new Date(h.expiresAt).getTime() > Date.now()
                    ? `expires ${new Date(h.expiresAt).toLocaleDateString('en-IN')}`
                    : `expired ${new Date(h.expiresAt).toLocaleDateString('en-IN')}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {confirming ? (
        <div className="mt-4 rounded-[6px] border border-[var(--rose)] bg-[#fdf2f2] p-3">
          <div className="text-[13px] font-semibold text-[var(--rose)]">Confirm rotation</div>
          <p className="text-mute mt-1 text-[12.5px]">
            Generates a new token. The current address
            <span className="mono"> {address} </span>
            keeps working for the next 7 days, then expires. Existing BCC instructions need updating
            to the new address.
          </p>
          {error ? <FieldError msg={error} /> : null}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="border-line text-ink hover:bg-paper-2 inline-flex h-8 items-center rounded-[5px] border bg-white px-3 text-[12.5px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={rotate}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-[var(--rose)] bg-[var(--rose)] px-3 text-[12.5px] font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              <RotateCw size={11} /> {pending ? 'Rotating…' : 'Rotate token'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
