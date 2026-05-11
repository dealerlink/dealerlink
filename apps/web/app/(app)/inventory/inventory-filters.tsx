'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';

interface Initial {
  search: string;
  status: string;
}

const STATUSES = [
  'in_stock',
  'reserved',
  'dispatched',
  'delivered',
  'returned',
  'damaged',
  'lost',
] as const;

export function InventoryFilters({ initial }: { initial: Initial }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.search);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (search === initial.search) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search.length > 0) next.set('search', search);
      else next.delete('search');
      next.delete('page');
      startTransition(() => router.replace(`/inventory?${next.toString()}`));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    router.replace(`/inventory?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[280px]">
        <Input
          placeholder="Search by serial number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <select
        value={initial.status}
        onChange={(e) => setFilter('status', e.target.value)}
        className="border-line text-ink h-[34px] rounded-[5px] border bg-white px-2 text-[12.5px]"
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace('_', ' ')}
          </option>
        ))}
      </select>
    </div>
  );
}
