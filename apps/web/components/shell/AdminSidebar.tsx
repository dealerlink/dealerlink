'use client';

import { Building2, Cog, LayoutDashboard, ShieldCheck, Users2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { displayNameFrom, initialsFrom } from '@/lib/format/initials';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Overview', icon: LayoutDashboard, href: '/admin' },
  { key: 'tenants', label: 'Tenants', icon: Building2, href: '/admin/tenants' },
  { key: 'operators', label: 'Operators', icon: ShieldCheck, href: '/admin/operators' },
  { key: 'platform', label: 'Platform settings', icon: Cog, href: '/admin/settings' },
] as const;

interface AdminSidebarProps {
  user: { fullName: string | null | undefined; email: string; role: string };
}

function PlatformMark() {
  return (
    <div className="relative flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-[6px] bg-white">
      <span className="absolute inset-[3px] rounded-[3px] border border-[#0B0F1A]" />
      <span
        className="absolute h-[2px] w-[12px] bg-[#0B0F1A]"
        style={{ transform: 'rotate(-32deg)' }}
      />
      <span
        className="absolute h-[2px] w-[8px] bg-[#0B0F1A]"
        style={{ transform: 'rotate(-32deg) translate(0, 6px)' }}
      />
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    // Exact match — every admin subroute matches a more specific entry.
    return pathname === '/admin';
  }
  return pathname === href || pathname.startsWith(href + '/');
}

export function AdminSidebar({ user }: AdminSidebarProps) {
  const pathname = usePathname();
  const initials = initialsFrom(user.fullName, user.email);
  const displayName = displayNameFrom(user.fullName, user.email);

  return (
    <aside
      className="flex flex-col bg-[#0B0F1A] text-white"
      style={{ width: 'var(--sidebar-width)', minHeight: '100%', flexShrink: 0 }}
    >
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <PlatformMark />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[14px] font-semibold tracking-[-0.01em]">Dealerlink</div>
            <span className="mono inline-flex h-[15px] items-center rounded-[3px] bg-[#3730A3] px-[5px] text-[9.5px] font-medium uppercase tracking-[0.08em] text-white">
              Platform
            </span>
          </div>
          <div className="mono truncate text-[10.5px] text-[#7C7E89]">operator console</div>
        </div>
      </div>

      <nav className="flex flex-col gap-[1px] px-2 pt-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} className={cn('nav-item', active && 'active')}>
              <Icon size={15} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-white/[0.08] px-3 pb-3 pt-4">
        <div className="flex items-center gap-2 px-1">
          <span className="av" style={{ background: '#3730A3' }}>
            {initials}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px]">{displayName}</div>
            <div className="mono truncate text-[10.5px] text-[#7C7E89]">operator</div>
          </div>
          <Link
            href="/admin/operators/me"
            className="icon-btn flex-shrink-0 !text-[#7C7E89] hover:!bg-white/5"
          >
            <Users2 size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
