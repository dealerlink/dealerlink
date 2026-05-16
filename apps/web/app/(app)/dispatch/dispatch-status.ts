import type { StatusTone } from '@/components/ui/status-pill';
import type { DispatchStatus } from '@dealerlink/schemas';

/** Status-pill tone for a dispatch's lifecycle status. */
export function dispatchStatusTone(s: DispatchStatus): StatusTone {
  switch (s) {
    case 'in_transit':
      return 'in';
    case 'delivered':
      return 'em';
    case 'returned':
      return 'ro';
    default:
      return 'mu';
  }
}

/** Human-readable dispatch status label. */
export function dispatchStatusLabel(s: DispatchStatus): string {
  return s.replace(/_/g, ' ');
}
