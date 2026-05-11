'use client';

import { LayoutGrid, Table } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Input } from '@/components/ui/input';

interface Initial {
  search: string;
  status: string;
  manufacturer: string;
  category: string;
}

export function ProductFilters({
  initial,
  currentView,
}: {
  initial: Initial;
  currentView: 'grid' | 'table';
}) {
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
      startTransition(() => router.replace(`/catalog?${next.toString()}`));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const setFilter = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    router.replace(`/catalog?${next.toString()}`);
  };

  const setView = (v: 'grid' | 'table') => {
    if (typeof window !== 'undefined') window.localStorage.setItem('catalog-view', v);
    const next = new URLSearchParams(params.toString());
    next.set('view', v);
    router.replace(`/catalog?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-[260px]">
        <Input
          placeholder="Search by name, SKU, manufacturer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <select
        value={initial.status}
        onChange={(e) => setFilter('status', e.target.value)}
        className="border-line text-ink h-[34px] rounded-[5px] border bg-white px-2 text-[12.5px]"
      >
        <option value="">All status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
        <option value="discontinued">Discontinued</option>
      </select>
      <input
        placeholder="Manufacturer"
        value={initial.manufacturer}
        onChange={(e) => setFilter('manufacturer', e.target.value)}
        className="border-line text-ink h-[34px] w-[160px] rounded-[5px] border bg-white px-2 text-[12.5px]"
      />
      <input
        placeholder="Category"
        value={initial.category}
        onChange={(e) => setFilter('category', e.target.value)}
        className="border-line text-ink h-[34px] w-[140px] rounded-[5px] border bg-white px-2 text-[12.5px]"
      />
      <div className="border-line ml-auto flex overflow-hidden rounded-[5px] border bg-white">
        <button
          type="button"
          onClick={() => setView('grid')}
          className={`flex h-[32px] items-center gap-1 px-2 text-[12px] ${
            currentView === 'grid' ? 'bg-paper-2 text-ink' : 'text-mute'
          }`}
        >
          <LayoutGrid size={12} /> Grid
        </button>
        <button
          type="button"
          onClick={() => setView('table')}
          className={`flex h-[32px] items-center gap-1 px-2 text-[12px] ${
            currentView === 'table' ? 'bg-paper-2 text-ink' : 'text-mute'
          }`}
        >
          <Table size={12} /> Table
        </button>
      </div>
    </div>
  );
}
