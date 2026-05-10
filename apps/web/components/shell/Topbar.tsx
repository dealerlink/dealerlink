import type { ReactNode } from 'react';

import { Bell, ChevronRight, CircleHelp, Moon } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface TopbarProps {
  crumbs?: BreadcrumbItem[];
  right?: ReactNode;
}

export function Topbar({ crumbs = [], right }: TopbarProps) {
  return (
    <div
      className="hairline-b bg-tile flex items-center gap-3 px-5"
      style={{ height: 'var(--topbar-height)', flexShrink: 0 }}
    >
      {/* Breadcrumbs */}
      <div className="text-mute flex min-w-0 flex-1 items-center gap-2 text-[12.5px]">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight size={12} />}
            <span className={i === crumbs.length - 1 ? 'text-ink font-medium' : ''}>
              {crumb.label}
            </span>
          </span>
        ))}
      </div>

      {/* Right slot + action icons */}
      <div className="flex items-center gap-2">
        {right}
        {right && <div className="hairline-l mx-1 h-6" />}
        <button className="icon-btn relative">
          <Bell size={15} />
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
            style={{ background: 'var(--accent)' }}
          />
        </button>
        <button className="icon-btn">
          <Moon size={15} />
        </button>
        <button className="icon-btn">
          <CircleHelp size={15} />
        </button>
      </div>
    </div>
  );
}
