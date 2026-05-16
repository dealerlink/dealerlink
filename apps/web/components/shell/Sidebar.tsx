'use client';

import {
  BarChart3,
  Banknote,
  Box,
  FileCheck,
  FileText,
  GitBranch,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Truck,
  UsersRound,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { displayNameFrom, initialsFrom } from '@/lib/format/initials';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Overview', icon: LayoutDashboard, href: '/dashboard', count: '' },
  { key: 'pipeline', label: 'Pipeline', icon: GitBranch, href: '/pipeline', count: '' },
  { key: 'dealers', label: 'Dealers', icon: UsersRound, href: '/dealers', count: '' },
  { key: 'catalog', label: 'Catalog', icon: Package, href: '/catalog', count: '' },
  { key: 'inventory', label: 'Inventory', icon: Box, href: '/inventory', count: '' },
  { key: 'quotations', label: 'Quotations', icon: FileText, href: '/quotations', count: '' },
  { key: 'pi', label: 'Performa Invoices', icon: FileCheck, href: '/pi', count: '' },
  { key: 'orders', label: 'Orders', icon: Receipt, href: '/orders', count: '' },
  { key: 'payments', label: 'Payments', icon: Banknote, href: '/payments', count: '' },
  { key: 'dispatch', label: 'Dispatch', icon: Truck, href: '/dispatch', count: '' },
  { key: 'reports', label: 'Reports', icon: BarChart3, href: '/reports', count: '' },
] as const;

interface SidebarUser {
  fullName: string | null | undefined;
  email: string;
  role: string;
}

interface SidebarTenant {
  displayName: string;
  slug: string;
}

interface SidebarProps {
  user: SidebarUser;
  tenant: SidebarTenant | null;
}

function DealerlinkLogo() {
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

function UserAvatar({ initials }: { initials: string }) {
  return (
    <span className="av" style={{ background: '#3730A3' }}>
      {initials}
    </span>
  );
}

export function Sidebar({ user, tenant }: SidebarProps) {
  const pathname = usePathname();

  const initials = initialsFrom(user.fullName, user.email);
  const displayName = displayNameFrom(user.fullName, user.email);

  return (
    <aside
      className="flex flex-col bg-[#0B0F1A] text-white"
      style={{ width: 'var(--sidebar-width)', minHeight: '100%', flexShrink: 0 }}
    >
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <DealerlinkLogo />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold tracking-[-0.01em]">
            {tenant?.displayName ?? 'Dealerlink'}
          </div>
          <div className="mono truncate text-[10.5px] text-[#7C7E89]">
            {tenant ? `${tenant.slug}.dealerlink.in` : 'dealerlink.in'}
          </div>
        </div>
      </div>

      {/* Quick find */}
      <div className="px-3 pt-2">
        <div className="flex h-[32px] items-center gap-2 rounded-[5px] bg-white/5 px-2 text-[12px] text-[#9FA1AB]">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span>Quick find</span>
          <span className="mono ml-auto rounded-[3px] border border-white/15 px-[5px] py-[1px] text-[10px] text-[#9FA1AB]">
            ⌘K
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-[1px] px-2 pt-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} className={cn('nav-item', isActive && 'active')}>
              <Icon size={15} />
              <span>{item.label}</span>
              {item.count && <span className="nav-count">{item.count}</span>}
            </Link>
          );
        })}
        <Link href="/settings" className={cn('nav-item', pathname === '/settings' && 'active')}>
          <Settings size={15} />
          <span>Settings</span>
        </Link>
      </nav>

      {/* User footer */}
      <div className="mt-auto border-t border-white/[0.08] px-3 pb-3 pt-4">
        <div className="flex items-center gap-2 px-1">
          <UserAvatar initials={initials} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px]">{displayName}</div>
            <div className="mono truncate text-[10.5px] text-[#7C7E89]">{user.role}</div>
          </div>
          <Link
            href="/settings"
            className="icon-btn flex-shrink-0 !text-[#7C7E89] hover:!bg-white/5"
          >
            <Settings size={14} />
          </Link>
        </div>
      </div>
    </aside>
  );
}
