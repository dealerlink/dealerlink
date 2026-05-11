/**
 * Compute a 1–2 letter avatar label from whatever identity scraps are
 * available. Never throws, never returns empty: falls back to '?'.
 *
 * Priority: full name → email local-part → '?'.
 */
export function initialsFrom(name?: string | null, email?: string | null): string {
  const display = (name?.trim() || email?.trim()) ?? '';
  if (!display) return '?';
  const letters = display
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .map((w) => w[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return letters || '?';
}

/**
 * The user-facing display name. Falls back to the email's local-part.
 */
export function displayNameFrom(name?: string | null, email?: string | null): string {
  if (name && name.trim()) return name.trim();
  if (email && email.trim()) {
    const local = email.split('@')[0];
    return local && local.length > 0 ? local : email;
  }
  return 'Unknown';
}
