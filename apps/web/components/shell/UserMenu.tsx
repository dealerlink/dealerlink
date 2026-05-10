'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, LogOut, Settings as SettingsIcon, User } from 'lucide-react';
import Link from 'next/link';
import { useTransition } from 'react';

import { logout } from '@/lib/auth/actions';

interface UserMenuProps {
  user: { fullName: string; email: string; role: string };
}

export function UserMenu({ user }: UserMenuProps) {
  const [isPending, startTransition] = useTransition();

  const initials = user.fullName
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('');

  const handleLogout = () => {
    startTransition(async () => {
      await logout();
    });
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="text-ink hover:bg-paper-2 flex h-8 items-center gap-1.5 rounded-[6px] px-1.5 text-[12.5px]"
          aria-label="User menu"
        >
          <span className="av" style={{ background: 'var(--accent)', width: 22, height: 22 }}>
            {initials}
          </span>
          <ChevronDown size={12} className="text-mute" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="text-ink shadow-paper hairline min-w-[220px] rounded-[6px] bg-white p-1 text-[12.5px]"
        >
          <div className="px-2.5 py-2">
            <div className="font-medium">{user.fullName}</div>
            <div className="mono text-mute truncate text-[11px]">{user.email}</div>
            <div className="mono text-mute-2 mt-1 text-[10.5px] uppercase tracking-[0.08em]">
              {user.role}
            </div>
          </div>
          <DropdownMenu.Separator className="bg-line my-1 h-px" />
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="hover:bg-paper-2 focus:bg-paper-2 flex cursor-pointer items-center gap-2 rounded-[4px] px-2.5 py-1.5 focus:outline-none"
            >
              <User size={13} className="text-mute" />
              Account
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/settings"
              className="hover:bg-paper-2 focus:bg-paper-2 flex cursor-pointer items-center gap-2 rounded-[4px] px-2.5 py-1.5 focus:outline-none"
            >
              <SettingsIcon size={13} className="text-mute" />
              Settings
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="bg-line my-1 h-px" />
          <DropdownMenu.Item
            onSelect={(e) => {
              e.preventDefault();
              handleLogout();
            }}
            disabled={isPending}
            className="hover:bg-paper-2 focus:bg-paper-2 flex cursor-pointer items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-[var(--rose)] focus:outline-none data-[disabled]:opacity-60"
          >
            <LogOut size={13} />
            {isPending ? 'Signing out…' : 'Sign out'}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
