'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Check, Eye, EyeOff, Info, Lock, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { logout } from '@/lib/auth/actions';
import { changePassword } from '@/lib/auth/change-password';
import { evaluatePasswordStrength, newPasswordSchema } from '@/lib/auth/password-policy';

const formSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'The new passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: 'Your new password must be different from the current one.',
    path: ['newPassword'],
  });

type FormData = z.infer<typeof formSchema>;

const STRENGTH_COLOR: Record<number, string> = {
  1: 'var(--rose)',
  2: 'var(--amber)',
  3: 'var(--accent)',
  4: 'var(--emerald)',
};

interface ChangePasswordFormProps {
  /** True when the user is here because `must_change_password` is set. */
  forced: boolean;
  userEmail: string;
}

export function ChangePasswordForm({ forced, userEmail }: ChangePasswordFormProps) {
  const router = useRouter();
  const [showPasswords, setShowPasswords] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: 'onBlur',
  });

  const newPassword = watch('newPassword') ?? '';
  const strength = evaluatePasswordStrength(newPassword);

  const onSubmit = handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        confirmPassword: data.confirmPassword,
      });
      if (result.ok) {
        router.push(result.redirectTo);
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  });

  const fieldType = showPasswords ? 'text' : 'password';

  return (
    <div className="mt-8">
      <div className="titlecaps">{forced ? 'One quick step' : 'Account security'}</div>
      <h1 className="mt-2 flex items-center gap-2 text-[28px] font-semibold tracking-[-0.02em]">
        {forced ? (
          <>
            Set a new <span className="editorial text-mute font-normal">password</span>
          </>
        ) : (
          <>
            Change your <span className="editorial text-mute font-normal">password</span>
          </>
        )}
        {forced && (
          <button
            type="button"
            onClick={() => setShowWhy((v) => !v)}
            className="icon-btn"
            aria-label="Why am I here?"
            aria-expanded={showWhy}
          >
            <Info size={15} className="text-mute" />
          </button>
        )}
      </h1>

      {forced ? (
        <p className="editorial text-mute mt-3 text-[13.5px]">
          Your account was created with a temporary password. Choose a password of your own to
          finish signing in.
        </p>
      ) : (
        <p className="editorial text-mute mt-3 text-[13.5px]">
          Update the password for <span className="text-ink">{userEmail}</span>.
        </p>
      )}

      {forced && showWhy && (
        <div className="border-line-2 text-ink-2 mt-3 rounded-[6px] border bg-white px-3 py-2.5 text-[12.5px] leading-relaxed">
          The temporary password you were emailed is single-use. For security, Dealerlink requires
          you to set a private password before you can reach the rest of the app — your operator
          never sees it.
        </div>
      )}

      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3.5" noValidate>
        {/* Current (temporary) password */}
        <div>
          <label
            htmlFor="currentPassword"
            className="mono text-mute text-[11.5px] uppercase tracking-[0.06em]"
          >
            {forced ? 'Temporary password' : 'Current password'}
          </label>
          <div className="hairline mt-1 flex h-[42px] items-center gap-2 rounded-[6px] bg-white px-3 focus-within:shadow-[inset_0_0_0_1.5px_var(--accent)]">
            <Lock size={14} className="text-mute" />
            <input
              id="currentPassword"
              type={fieldType}
              autoComplete="current-password"
              autoFocus
              placeholder="••••••••"
              className="mono flex-1 bg-transparent text-[13px] outline-none"
              {...register('currentPassword')}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((v) => !v)}
              className="icon-btn"
              aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}
            >
              {showPasswords ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          {errors.currentPassword && (
            <div className="mt-1 text-[11.5px] text-[var(--rose)]">
              {errors.currentPassword.message}
            </div>
          )}
        </div>

        {/* New password */}
        <div>
          <label
            htmlFor="newPassword"
            className="mono text-mute text-[11.5px] uppercase tracking-[0.06em]"
          >
            New password
          </label>
          <div className="hairline mt-1 flex h-[42px] items-center gap-2 rounded-[6px] bg-white px-3 focus-within:shadow-[inset_0_0_0_1.5px_var(--accent)]">
            <Lock size={14} className="text-mute" />
            <input
              id="newPassword"
              type={fieldType}
              autoComplete="new-password"
              placeholder="••••••••"
              className="mono flex-1 bg-transparent text-[13px] outline-none"
              {...register('newPassword')}
            />
          </div>

          {/* Strength meter + rule checklist */}
          {newPassword.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <div className="bg-paper-2 h-[4px] flex-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(strength.score / 4) * 100}%`,
                      background: STRENGTH_COLOR[strength.score],
                    }}
                  />
                </div>
                <span className="mono text-mute text-[10.5px] uppercase tracking-[0.06em]">
                  {strength.label}
                </span>
              </div>
              <ul className="mono text-mute-2 mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
                <Rule ok={strength.checks.length} label="8+ characters" />
                <Rule ok={strength.checks.uppercase} label="Uppercase letter" />
                <Rule ok={strength.checks.number} label="Number" />
                <Rule ok={strength.checks.special} label="Special character" />
              </ul>
            </div>
          )}

          {errors.newPassword && (
            <div className="mt-1 text-[11.5px] text-[var(--rose)]">
              {errors.newPassword.message}
            </div>
          )}
        </div>

        {/* Confirm */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="mono text-mute text-[11.5px] uppercase tracking-[0.06em]"
          >
            Confirm new password
          </label>
          <div className="hairline mt-1 flex h-[42px] items-center gap-2 rounded-[6px] bg-white px-3 focus-within:shadow-[inset_0_0_0_1.5px_var(--accent)]">
            <Lock size={14} className="text-mute" />
            <input
              id="confirmPassword"
              type={fieldType}
              autoComplete="new-password"
              placeholder="••••••••"
              className="mono flex-1 bg-transparent text-[13px] outline-none"
              {...register('confirmPassword')}
            />
          </div>
          {errors.confirmPassword && (
            <div className="mt-1 text-[11.5px] text-[var(--rose)]">
              {errors.confirmPassword.message}
            </div>
          )}
        </div>

        {serverError && (
          <div
            role="alert"
            className="border-[var(--rose)]/30 bg-[var(--rose)]/[0.06] rounded-[6px] border px-3 py-2 text-[12.5px] text-[var(--rose)]"
          >
            {serverError}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 inline-flex h-[44px] items-center justify-center gap-2 rounded-[6px] bg-[var(--accent)] text-[13.5px] font-medium text-white transition hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Updating…' : 'Update password & continue'}
          {!isPending && <ArrowRight size={14} />}
        </button>
      </form>

      {/* The only escape route besides changing the password. */}
      <form action={logout} className="mt-5 text-center">
        <button type="submit" className="text-mute text-[12.5px] hover:text-[var(--accent)]">
          Sign out instead
        </button>
      </form>
    </div>
  );
}

function Rule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-1.5" style={ok ? { color: 'var(--emerald)' } : undefined}>
      {ok ? <Check size={11} /> : <X size={11} className="opacity-50" />}
      {label}
    </li>
  );
}
