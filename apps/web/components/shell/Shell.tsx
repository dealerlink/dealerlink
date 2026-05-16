import type { ReactNode } from 'react';

import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface ShellUser {
  fullName: string | null | undefined;
  role: string;
  email: string;
}

interface ShellTenant {
  displayName: string;
  slug: string;
}

interface ShellProps {
  crumbs?: BreadcrumbItem[];
  topRight?: ReactNode;
  user: ShellUser;
  tenant: ShellTenant | null;
  children: ReactNode;
}

export function Shell({ crumbs, topRight, user, tenant, children }: ShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Skip link — first focusable element; visible only on focus. */}
      <a
        href="#main-content"
        className="bg-ink sr-only z-50 rounded-[6px] px-3 py-2 text-[13px] font-medium text-white focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <Sidebar user={user} tenant={tenant} />
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--paper)' }}>
        <Topbar
          user={user}
          {...(crumbs !== undefined && { crumbs })}
          {...(topRight !== undefined && { right: topRight })}
        />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto outline-none">
          {children}
        </main>
      </div>
    </div>
  );
}
