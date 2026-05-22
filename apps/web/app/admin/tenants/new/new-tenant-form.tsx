'use client';

import * as React from 'react';
import { useEffect, useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Check, CircleAlert, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { checkSlugAvailable } from '@/lib/actions/admin/check-slug';
import { createTenant } from '@/lib/actions/admin/create-tenant';
import { INDIAN_STATE_OPTIONS } from '@dealerlink/schemas';
import { createTenantSchema, type CreateTenantInput } from '@/lib/admin/schemas';
import { isValidGSTINFormat, panFromGSTIN } from '@/lib/format';

type CreateResult = Awaited<ReturnType<typeof createTenant>>;

export function NewTenantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [slugStatus, setSlugStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<CreateTenantInput>({
    resolver: zodResolver(createTenantSchema),
    mode: 'onBlur',
    defaultValues: {
      slug: '',
      legalName: '',
      displayName: '',
      gstin: '',
      pan: '',
      addressLine1: '',
      addressLine2: '',
      addressCity: '',
      addressPincode: '',
      bankAccountName: '',
      bankAccountNumber: '',
      bankIfsc: '',
      bankBranch: '',
      adminEmail: '',
      adminFullName: '',
    },
  });

  const slug = watch('slug');
  const gstin = watch('gstin');

  // Debounced slug availability check
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugStatus('idle');
      return;
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/.test(slug)) {
      setSlugStatus('invalid');
      return;
    }
    setSlugStatus('checking');
    const handle = setTimeout(async () => {
      const result = await checkSlugAvailable({ slug });
      if (result.ok) {
        setSlugStatus(result.data.available ? 'available' : 'taken');
      } else {
        setSlugStatus('idle');
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [slug]);

  // Auto-derive PAN from GSTIN when the GSTIN format is complete and the
  // PAN field hasn't been hand-edited (we treat "empty or matches the
  // previous derivation" as untouched).
  const [autoDerivedPan, setAutoDerivedPan] = useState<string>('');
  useEffect(() => {
    if (!gstin || gstin.length < 12) return;
    if (!isValidGSTINFormat(gstin)) return;
    const pan = panFromGSTIN(gstin);
    if (!pan) return;
    const currentPan = (watch('pan') ?? '').toUpperCase();
    if (!currentPan || currentPan === autoDerivedPan) {
      setValue('pan', pan, { shouldValidate: true });
      setAutoDerivedPan(pan);
    }
  }, [gstin, autoDerivedPan, setValue, watch]);

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result: CreateResult = await createTenant(values);
      if (!result.ok) {
        if (result.error.code === 'CONFLICT') {
          setError('slug', { message: result.error.message });
          setSlugStatus('taken');
          return;
        }
        if (result.error.code === 'VALIDATION') {
          setServerError(result.error.message);
          return;
        }
        setServerError(result.error.message);
        return;
      }
      // Stash credentials in a server-rendered query param so the next
      // page can show them once. We use sessionStorage for the password
      // so it does not land in browser history / server logs.
      try {
        sessionStorage.setItem(
          'dl_tenant_credentials',
          JSON.stringify({
            tenantId: result.data.tenantId,
            adminEmail: result.data.adminEmail,
            temporaryPassword: result.data.temporaryPassword,
            loginUrl: result.data.loginUrl,
          }),
        );
      } catch {
        // Private mode or quota — the credentials are also visible in
        // the welcome email, so this is non-fatal.
      }
      router.push(`/admin/tenants/${result.data.tenantId}?provisioned=1`);
    });
  });

  const slugBadge = (() => {
    if (slugStatus === 'checking') {
      return (
        <span className="text-mute inline-flex items-center gap-1 text-[12px]">
          <Loader2 className="animate-spin" size={12} /> Checking…
        </span>
      );
    }
    if (slugStatus === 'available') {
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--emerald)]">
          <Check size={12} /> Available
        </span>
      );
    }
    if (slugStatus === 'taken') {
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--rose)]">
          <CircleAlert size={12} /> Already taken
        </span>
      );
    }
    if (slugStatus === 'invalid') {
      return (
        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--amber)]">
          <CircleAlert size={12} /> Use lowercase letters, digits, hyphens
        </span>
      );
    }
    return null;
  })();

  const canSubmit = isValid && slugStatus !== 'taken' && slugStatus !== 'invalid' && !pending;

  return (
    <div className="bg-paper min-h-screen pb-32">
      <div className="mx-auto max-w-[920px] px-8 py-12">
        <Link
          href="/admin"
          className="text-mute hover:text-ink inline-flex items-center gap-1 text-[12.5px]"
        >
          <ArrowLeft size={12} /> Back to tenants
        </Link>
        <div className="mt-4 flex items-start justify-between">
          <div>
            <div className="titlecaps">Operator console</div>
            <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.02em]">New tenant</h1>
            <p className="text-mute mt-1 text-[13px]">
              Provisions the tenant record, GST defaults, an initial Admin user, and queues a
              welcome email with temporary credentials.
            </p>
          </div>
        </div>

        <form id="new-tenant-form" onSubmit={onSubmit} className="mt-8 space-y-6" noValidate>
          <Section title="Identity">
            <Field label="Slug" error={errors.slug?.message} hint={slugBadge}>
              <div className="flex items-center gap-2">
                <input
                  {...register('slug', {
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      e.target.value = e.target.value.toLowerCase();
                    },
                  })}
                  placeholder="acme"
                  autoComplete="off"
                  spellCheck={false}
                  className={inputClass}
                />
                <span className="text-mute mono shrink-0 text-[12px]">.dealerlink.in</span>
              </div>
            </Field>
            <Field label="Legal name" error={errors.legalName?.message}>
              <input
                {...register('legalName')}
                placeholder="Acme Solar Pvt Ltd"
                className={inputClass}
              />
            </Field>
            <Field
              label="Display name"
              error={errors.displayName?.message}
              hint={<span className="text-mute text-[11.5px]">Shown in the sidebar + emails</span>}
            >
              <input {...register('displayName')} placeholder="Acme Solar" className={inputClass} />
            </Field>
          </Section>

          <Section title="Compliance">
            <Field
              label="GSTIN"
              error={errors.gstin?.message}
              hint={<span className="text-mute text-[11.5px]">15 chars, checksum validated</span>}
            >
              <input
                {...register('gstin', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    e.target.value = e.target.value.toUpperCase();
                  },
                })}
                placeholder="27AABCD1234E1Z8"
                className={`${inputClass} mono`}
                maxLength={15}
                autoComplete="off"
              />
            </Field>
            <Field
              label="PAN"
              error={errors.pan?.message}
              hint={
                <span className="text-mute text-[11.5px]">
                  Auto-filled from GSTIN; edit if different
                </span>
              }
            >
              <input
                {...register('pan', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    e.target.value = e.target.value.toUpperCase();
                  },
                })}
                placeholder="AABCD1234E"
                className={`${inputClass} mono`}
                maxLength={10}
                autoComplete="off"
              />
            </Field>
            <Field
              label="State (tax)"
              error={errors.state?.message}
              hint={
                <span className="text-mute text-[11.5px]">
                  Drives CGST+SGST vs IGST on every invoice
                </span>
              }
            >
              <StateSelect {...register('state')} />
            </Field>
          </Section>

          <Section title="Registered address">
            <Field label="Address line 1" error={errors.addressLine1?.message}>
              <input
                {...register('addressLine1')}
                placeholder="4th Floor, Solitaire Corporate Park"
                className={inputClass}
              />
            </Field>
            <Field label="Address line 2" error={errors.addressLine2?.message}>
              <input
                {...register('addressLine2')}
                placeholder="Andheri East"
                className={inputClass}
              />
            </Field>
            <Field label="City" error={errors.addressCity?.message}>
              <input {...register('addressCity')} placeholder="Mumbai" className={inputClass} />
            </Field>
            <Field label="Pincode" error={errors.addressPincode?.message}>
              <input
                {...register('addressPincode')}
                placeholder="400093"
                maxLength={6}
                className={`${inputClass} mono`}
              />
            </Field>
            <Field label="Address state" error={errors.addressState?.message}>
              <StateSelect {...register('addressState')} />
            </Field>
          </Section>

          <Section title="Bank (printed on invoices)">
            <Field label="Account name" error={errors.bankAccountName?.message}>
              <input
                {...register('bankAccountName')}
                placeholder="Acme Solar Pvt Ltd"
                className={inputClass}
              />
            </Field>
            <Field label="Account number" error={errors.bankAccountNumber?.message}>
              <input
                {...register('bankAccountNumber')}
                placeholder="50200012345678"
                className={`${inputClass} mono`}
                inputMode="numeric"
              />
            </Field>
            <Field label="IFSC" error={errors.bankIfsc?.message}>
              <input
                {...register('bankIfsc', {
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                    e.target.value = e.target.value.toUpperCase();
                  },
                })}
                placeholder="HDFC0001234"
                className={`${inputClass} mono`}
                maxLength={11}
              />
            </Field>
            <Field label="Branch" error={errors.bankBranch?.message}>
              <input
                {...register('bankBranch')}
                placeholder="Andheri East, Mumbai"
                className={inputClass}
              />
            </Field>
          </Section>

          <Section title="Initial admin user">
            <Field label="Full name" error={errors.adminFullName?.message}>
              <input
                {...register('adminFullName')}
                placeholder="Priya Sharma"
                className={inputClass}
              />
            </Field>
            <Field
              label="Email"
              error={errors.adminEmail?.message}
              hint={
                <span className="text-mute text-[11.5px]">
                  A temporary password will be generated and emailed here.
                </span>
              }
            >
              <input
                {...register('adminEmail')}
                type="email"
                placeholder="priya@acme.in"
                className={inputClass}
                autoComplete="off"
              />
            </Field>
          </Section>

          {serverError ? (
            <div className="rounded-[6px] border border-[var(--rose)] bg-[#fdf2f2] px-3 py-2 text-[12.5px] text-[var(--rose)]">
              {serverError}
            </div>
          ) : null}
        </form>
      </div>

      {/* Sticky action bar */}
      <div className="border-line fixed inset-x-0 bottom-0 border-t bg-white">
        <div className="mx-auto flex max-w-[920px] items-center justify-between px-8 py-3">
          <div className="text-mute text-[12px]">
            Branding (logo, accent color) can be configured after creation.
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="border-line text-ink hover:bg-paper-2 inline-flex h-9 items-center rounded-[6px] border bg-white px-3 text-[12.5px] font-medium"
            >
              Cancel
            </Link>
            <button
              form="new-tenant-form"
              type="submit"
              disabled={!canSubmit}
              className="border-accent bg-accent inline-flex h-9 items-center gap-2 rounded-[6px] border px-4 text-[12.5px] font-medium text-white hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 className="animate-spin" size={13} /> : <ArrowRight size={13} />}
              {pending ? 'Creating…' : 'Create tenant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'border-line text-ink placeholder:text-mute focus:ring-accent focus:border-accent flex h-[34px] w-full rounded-[5px] border bg-white px-3 text-[13px] focus:outline-none focus:ring-1';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="hairline rounded-[8px] bg-white p-5">
      <div className="titlecaps mb-3">{title}</div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: React.ReactNode | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-mute text-[11.5px] font-medium">{label}</label>
        {hint}
      </div>
      {children}
      {error ? <div className="text-[11.5px] text-[var(--rose)]">{error}</div> : null}
    </div>
  );
}

const StateSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function StateSelect(props, ref) {
  return (
    <select
      ref={ref}
      className="border-line text-ink focus:ring-accent focus:border-accent h-[34px] w-full rounded-[5px] border bg-white px-2 text-[13px] focus:outline-none focus:ring-1"
      {...props}
    >
      <option value="">Select…</option>
      {INDIAN_STATE_OPTIONS.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name}
        </option>
      ))}
    </select>
  );
});
