'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  BarChart3,
  Banknote,
  Box,
  FileText,
  GitBranch,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Truck,
  UsersRound,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Overview', icon: LayoutDashboard, href: '/dashboard', count: '' },
  { key: 'pipeline', label: 'Pipeline', icon: GitBranch, href: '/pipeline', count: '42' },
  { key: 'dealers', label: 'Dealers', icon: UsersRound, href: '/dealers', count: '218' },
  { key: 'catalog', label: 'Catalog', icon: Package, href: '/catalog', count: '86' },
  { key: 'inventory', label: 'Inventory', icon: Box, href: '/inventory', count: '4,812' },
  { key: 'quotations', label: 'Quotations', icon: FileText, href: '/quotations', count: '19' },
  { key: 'orders', label: 'Orders', icon: Receipt, href: '/orders', count: '34' },
  { key: 'payments', label: 'Payments', icon: Banknote, href: '/payments', count: '' },
  { key: 'dispatch', label: 'Dispatch', icon: Truck, href: '/dispatch', count: '7' },
  { key: 'reports', label: 'Reports', icon: BarChart3, href: '/reports', count: '' },
] as const;

// Placeholder — real tenant data comes from auth context in Day 2
const PLACEHOLDER = {
  tenantName: 'Demo Solar Distributors',
  tenantSlug: 'demo-solar-distributors',
  userName: 'Akshay Mittal',
  userRole: 'admin · sales',
  quotaMtd: 68,
  quotaValue: '₹3.42 Cr',
  quotaTarget: '₹5.00 Cr',
};

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

export function Sidebar() {
  const pathname = usePathname();

  const initials = PLACEHOLDER.userName
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('');

  return (
    <aside
      className="flex flex-col bg-[#0B0F1A] text-white"
      style={{ width: 'var(--sidebar-width)', minHeight: '100%', flexShrink: 0 }}
    >
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <DealerlinkLogo />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold tracking-[-0.01em]">Dealerlink</div>
          <div className="mono truncate text-[10.5px] text-[#7C7E89]">{PLACEHOLDER.tenantSlug}</div>
        </div>
        <button className="icon-btn flex-shrink-0 !text-[#7C7E89] hover:!bg-white/5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m11 17-5-5 5-5" />
            <path d="m18 17-5-5 5-5" />
          </svg>
        </button>
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

      {/* Quota widget + user footer */}
      <div className="mt-auto border-t border-white/[0.08] px-3 pb-3 pt-4">
        <div className="mono mb-2 px-1 text-[10.5px] uppercase tracking-[0.08em] text-[#7C7E89]">
          Books · FY 25–26
        </div>
        <div className="rounded-[6px] bg-white/5 p-3">
          <div className="flex items-baseline justify-between">
            <div className="text-[10.5px] uppercase tracking-[0.1em] text-[#9FA1AB]">Quota MTD</div>
            <div className="mono text-[11px] text-[#A8A9B3]">{PLACEHOLDER.quotaMtd}%</div>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${PLACEHOLDER.quotaMtd}%` }}
            />
          </div>
          <div className="mono mt-2 text-[12px]">
            {PLACEHOLDER.quotaValue}{' '}
            <span className="text-[#7C7E89]">/ {PLACEHOLDER.quotaTarget}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 px-1">
          <UserAvatar initials={initials} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12px]">{PLACEHOLDER.userName}</div>
            <div className="mono truncate text-[10.5px] text-[#7C7E89]">{PLACEHOLDER.userRole}</div>
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
