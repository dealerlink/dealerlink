/** Indian fiscal year — April 1 to March 31. Per CLAUDE.md §8 #4. */
export function fiscalYear(date: Date = new Date()): number {
  const m = date.getUTCMonth();
  return m >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}
