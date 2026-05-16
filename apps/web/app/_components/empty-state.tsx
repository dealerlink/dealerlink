import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Empty-state panel for list/detail screens.
 *
 * Two intents (Day 16 B1.3):
 *   - "no data exists yet" — friendly, with a create CTA.
 *   - "filter excluded everything" — informative, with a clear-filters action.
 * The caller picks the copy + action; this component only lays it out. It
 * renders borderless — list pages drop it inside their existing table card;
 * for standalone use, wrap it in a bordered panel.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="border-line bg-tile mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border">
        <Icon size={19} className="text-mute" aria-hidden="true" />
      </div>
      <div className="text-ink text-[14px] font-medium">{title}</div>
      {description && (
        <p className="text-mute mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
