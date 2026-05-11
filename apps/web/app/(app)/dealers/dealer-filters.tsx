'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';

interface Initial {
  search: string;
  status: string;
  type: string;
  category: string;
  riskLevel: string;
}

const SELECTS: { name: keyof Initial; label: string; options: string[] }[] = [
  { name: 'status', label: 'Status', options: ['active', 'inactive', 'on_hold'] },
  { name: 'type', label: 'Type', options: ['retailer', 'wholesaler', 'installer', 'epc', 'other'] },
  { name: 'category', label: 'Category', options: ['A', 'B', 'C'] },
  { name: 'riskLevel', label: 'Risk', options: ['low', 'medium', 'high'] },
];

export function DealerFilters({ initial }: { initial: Initial }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.search);
  const [, startTransition] = useTransition();

  // Debounced search push to the URL.
  useEffect(() => {
    if (search === initial.search) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search.length > 0) next.set('search', search);
      else next.delete('search');
      next.delete('page');
      startTransition(() => router.replace(`/dealers?${next.toString()}`));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    router.replace(`/dealers?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[260px]">
        <Input
          placeholder="Search by name, code, GSTIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {SELECTS.map((s) => (
        <select
          key={s.name}
          value={initial[s.name]}
          onChange={(e) => setFilter(s.name, e.target.value)}
          className="border-line text-ink h-[34px] rounded-[5px] border bg-white px-2 text-[12.5px]"
        >
          <option value="">All {s.label.toLowerCase()}</option>
          {s.options.map((o) => (
            <option key={o} value={o}>
              {o.replace('_', ' ')}
            </option>
          ))}
        </select>
      ))}
    </div>
  );
}
