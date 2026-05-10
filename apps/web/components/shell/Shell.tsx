import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface ShellProps {
  crumbs?: BreadcrumbItem[];
  topRight?: ReactNode;
  children: ReactNode;
}

export function Shell({ crumbs, topRight, children }: ShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--paper)' }}>
        <Topbar
          {...(crumbs !== undefined && { crumbs })}
          {...(topRight !== undefined && { right: topRight })}
        />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
