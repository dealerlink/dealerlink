'use server';

import { users, withOperator, withTenant, type DrizzleTx } from '@dealerlink/db';
import { eq, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

import { AppError, isAppError } from '@/lib/errors';
import { runWithLogContext } from '@/lib/observability/als';
import { trackEvent } from '@/lib/observability/events';

import { newPasswordSchema } from './password-policy';
import { hashPassword, verifyPassword } from './password';
import { getAuthContext, type AuthContext } from './session';

// Mirrors LoginResult so the (auth) forms share one result shape.
export type ChangePasswordResult = { ok: true; redirectTo: string } | { ok: false; error: string };

const changePasswordSchema = z
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

export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

function clientMeta() {
  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null;
  const userAgent = h.get('user-agent') ?? null;
  const requestId = h.get('x-request-id') ?? crypto.randomUUID();
  return { ip, userAgent, requestId };
}

/**
 * Run `fn` inside the correct transactional scope for the caller so RLS sees
 * the right rows and the `users` audit trigger attaches to the right tenant:
 *   - Tenant users → `withTenant(tenantId, …, { userId })`.
 *   - Operators (tenant_id NULL) → `withOperator(userId, …)`; the users RLS
 *     policy returns the null-tenant rows when `app.tenant_id` is unset.
 */
function runScoped<T>(
  auth: AuthContext,
  ip: string | null,
  userAgent: string | null,
  fn: (tx: DrizzleTx) => Promise<T>,
): Promise<T> {
  if (auth.user.tenantId) {
    return withTenant(auth.user.tenantId, fn, { userId: auth.user.id, ip, userAgent });
  }
  return withOperator(auth.user.id, fn, { ip, userAgent });
}

/**
 * Change the signed-in user's password.
 *
 * Contract (Stage C Day C.1, CLAUDE.md §6 + ADR-010):
 *   1. Caller must be authenticated (any role).
 *   2. The CURRENT password must verify — this is what makes the temporary
 *      credential single-use and blocks a hijacked session from silently
 *      re-keying the account.
 *   3. The NEW password must satisfy the product policy (newPasswordSchema)
 *      and differ from the current one.
 *   4. On success the password hash is updated AND `must_change_password` is
 *      cleared in the same row UPDATE — one atomic statement, so the trapdoor
 *      can never be left half-open. The users audit trigger records the
 *      change with `password_hash` redacted; no audit row is written from
 *      application code.
 *   5. `user.password_changed` is emitted to Axiom with `forced` reflecting
 *      whether this was a forced rotation.
 *
 * The current Lucia session stays valid — the user continues straight to
 * their workspace; the layout guard now lets them through.
 */
export async function changePassword(raw: ChangePasswordInput): Promise<ChangePasswordResult> {
  const auth = await getAuthContext();
  if (!auth || auth.user.status !== 'active') {
    return { ok: false, error: 'Your session has expired. Please sign in again.' };
  }

  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }
  const { currentPassword, newPassword } = parsed.data;
  const { ip, userAgent, requestId } = clientMeta();

  // `must_change_password` BEFORE we clear it — drives the `forced` flag and
  // the post-change destination.
  const wasForced = auth.user.mustChangePassword;

  try {
    await runWithLogContext(
      {
        requestId,
        userId: auth.user.id,
        role: auth.user.role,
        ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}),
      },
      () =>
        runScoped(auth, ip, userAgent, async (tx) => {
          const [row] = await tx
            .select({ passwordHash: users.passwordHash })
            .from(users)
            .where(eq(users.id, auth.user.id))
            .limit(1);
          if (!row) throw new AppError('NOT_FOUND', 'Account not found.');

          const currentValid = await verifyPassword(row.passwordHash, currentPassword);
          if (!currentValid) {
            throw new AppError('UNAUTHORIZED', 'Your current password is incorrect.');
          }

          const passwordHash = await hashPassword(newPassword);
          await tx
            .update(users)
            .set({ passwordHash, mustChangePassword: false, updatedAt: sql`now()` })
            .where(eq(users.id, auth.user.id));
        }),
    );
  } catch (err) {
    if (isAppError(err)) return { ok: false, error: err.message };
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }

  // Analytics — fire-and-forget, attached to the same log context.
  runWithLogContext(
    {
      userId: auth.user.id,
      role: auth.user.role,
      ...(auth.user.tenantId ? { tenantId: auth.user.tenantId } : {}),
    },
    () => trackEvent('user.password_changed', { forced: wasForced }),
  );

  const redirectTo = auth.user.role === 'operator' ? '/admin' : '/dashboard';
  return { ok: true, redirectTo };
}
