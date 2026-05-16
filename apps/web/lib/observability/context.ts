/**
 * Sentry scope enrichment (Day 17, chunk 17a).
 *
 * These helpers attach tenant / user / route context to the current Sentry
 * scope so every captured event is triageable: "which tenant, which user,
 * which route". They are deliberately thin wrappers around `Sentry.*` — the
 * value is the consistent tag vocabulary, not the plumbing.
 *
 * Call sites:
 *   - `setSentryUser`   — after Lucia resolves a session (see auth/session).
 *   - `setSentryTenant` — after tenant resolution (tenant context / actions).
 *   - `setSentryRoute`  — auto-captured by the Next.js integration; this
 *                         helper exists for code paths (jobs, webhooks) that
 *                         want to set it explicitly.
 *
 * Raw email is allowed through here because `scrubEvent` (the `beforeSend`
 * hook) rewrites it to a stable hash before the event leaves the process.
 */
import * as Sentry from '@sentry/nextjs';

export function setSentryUser(user: { userId: string; email?: string; role?: string }): void {
  Sentry.setUser({
    id: user.userId,
    ...(user.email ? { email: user.email } : {}),
    ...(user.role ? { username: user.role } : {}),
  });
  if (user.role) Sentry.setTag('user.role', user.role);
}

export function setSentryTenant(tenant: { tenantId: string; tenantSlug?: string }): void {
  Sentry.setTag('tenant.id', tenant.tenantId);
  if (tenant.tenantSlug) Sentry.setTag('tenant.slug', tenant.tenantSlug);
}

export function setSentryRoute(route: { route: string; method?: string }): void {
  Sentry.setTag('route', route.route);
  if (route.method) Sentry.setTag('http.method', route.method);
}

/** Clear all tenant/user/route context — used on logout and between jobs. */
export function clearSentryContext(): void {
  Sentry.setUser(null);
}
