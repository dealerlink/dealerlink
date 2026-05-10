'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AtSign, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { login } from '@/lib/auth/actions';

const formSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface LoginFormProps {
  tenantSlug: string | null;
}

export function LoginForm({ tenantSlug }: LoginFormProps) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { rememberMe: true },
  });

  const onSubmit = handleSubmit((data) => {
    setServerError(null);
    startTransition(async () => {
      const result = await login({
        email: data.email,
        password: data.password,
        rememberMe: data.rememberMe ?? false,
        ...(tenantSlug ? { tenantSlug } : {}),
      });
      if (result.ok) {
        router.push(result.redirectTo);
        router.refresh();
      } else {
        setServerError(result.error);
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3.5" noValidate>
      <div>
        <label htmlFor="email" className="mono text-mute text-[11.5px] uppercase tracking-[0.06em]">
          Email
        </label>
        <div className="hairline mt-1 flex h-[42px] items-center gap-2 rounded-[6px] bg-white px-3 focus-within:shadow-[inset_0_0_0_1.5px_var(--accent)]">
          <AtSign size={14} className="text-mute" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
            className="flex-1 bg-transparent text-[13px] outline-none"
            {...register('email')}
          />
        </div>
        {errors.email && (
          <div className="mt-1 text-[11.5px] text-[var(--rose)]">{errors.email.message}</div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label
            htmlFor="password"
            className="mono text-mute text-[11.5px] uppercase tracking-[0.06em]"
          >
            Password
          </label>
          <a href="#" className="text-[11.5px] text-[var(--accent)] hover:underline">
            Forgot?
          </a>
        </div>
        <div className="hairline mt-1 flex h-[42px] items-center gap-2 rounded-[6px] bg-white px-3 focus-within:shadow-[inset_0_0_0_1.5px_var(--accent)]">
          <Lock size={14} className="text-mute" />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••"
            className="mono flex-1 bg-transparent text-[13px] outline-none"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="icon-btn"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
        {errors.password && (
          <div className="mt-1 text-[11.5px] text-[var(--rose)]">{errors.password.message}</div>
        )}
      </div>

      <label className="text-ink-2 mt-1 flex items-center gap-2 text-[12.5px]">
        <input
          type="checkbox"
          className="border-line-2 text-ink h-3.5 w-3.5 rounded-[3px] focus:ring-0"
          {...register('rememberMe')}
        />
        Remember this device for 30 days
      </label>

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
        {isPending ? 'Signing in…' : 'Continue'}
        {!isPending && <ArrowRight size={14} />}
      </button>
    </form>
  );
}
