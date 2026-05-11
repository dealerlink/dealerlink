import { AppError } from '@/lib/errors';

import { getAuthContext, type AuthContext } from './session';

type Role = AuthContext['user']['role'];

export type { AuthContext };

/**
 * Server-side gate. Call at the top of every protected Server Action,
 * Route Handler, and tRPC procedure. Hides nothing — never trust the UI.
 */
export async function requireRole(allowed: Role[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Authentication required');
  if (ctx.user.status !== 'active') throw new AppError('FORBIDDEN', 'Account is not active');
  if (!allowed.includes(ctx.user.role))
    throw new AppError('FORBIDDEN', 'Your role cannot perform this action');
  return ctx;
}

/**
 * Looser variant: only requires an authenticated user, regardless of role.
 */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw new AppError('UNAUTHORIZED', 'Authentication required');
  if (ctx.user.status !== 'active') throw new AppError('FORBIDDEN', 'Account is not active');
  return ctx;
}
