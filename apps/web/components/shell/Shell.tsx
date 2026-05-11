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
      <Sidebar user={user} tenant={tenant} />
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--paper)' }}>
        <Topbar
          user={user}
          {...(crumbs !== undefined && { crumbs })}
          {...(topRight !== undefined && { right: topRight })}
        />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
