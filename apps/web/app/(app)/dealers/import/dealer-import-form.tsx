'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { bulkImportDealers } from '@/lib/actions/dealers';
import { parseCSV, rowsToObjects } from '@/lib/csv';

interface PreviewRow {
  ok: boolean;
  error?: string;
  data?: Record<string, string>;
}

export function DealerImportForm({ template }: { template: string }) {
  const router = useRouter();
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function doPreview() {
    setError(null);
    try {
      const { headers, rows } = parseCSV(csv);
      const objs = rowsToObjects(headers, rows);
      setPreview(objs.slice(0, 10).map((d) => ({ ok: !!d.legalName && !!d.displayName, data: d })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse CSV');
    }
  }

  async function doImport() {
    setBusy(true);
    setError(null);
    try {
      const { headers, rows } = parseCSV(csv);
      const objs = rowsToObjects(headers, rows);
      const payload = objs.map((r) => ({
        legalName: r.legalName ?? '',
        displayName: r.displayName ?? r.legalName ?? '',
        gstin: r.gstin ?? '',
        pan: r.pan ?? '',
        state: r.state ?? '',
        city: r.city ?? '',
        pincode: r.pincode ?? '',
        addressLine1: r.addressLine1 ?? '',
        type: (r.type ?? 'retailer') as 'retailer',
        category: (r.category ?? 'B') as 'B',
        riskLevel: (r.riskLevel ?? 'low') as 'low',
        email: r.email ?? '',
        phone: r.phone ?? '',
        creditLimit: r.creditLimit ? Number(r.creditLimit) : null,
        creditPeriodDays: r.creditPeriodDays ? Number(r.creditPeriodDays) : null,
        discountPercent: r.discountPercent ? Number(r.discountPercent) : 0,
        tags: r.tags
          ? r.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
        country: 'IN',
      }));
      const result = await bulkImportDealers({ rows: payload });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      alert(`Imported ${result.data.count} dealers.`);
      router.push('/dealers');
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setCsv(text);
    };
    reader.readAsText(file);
  }

  return (
    <div className="mt-6 space-y-4">
      {error && (
        <div className="border-rose bg-rose/10 text-rose rounded-[5px] border px-3 py-2 text-[12.5px]">
          {error}
        </div>
      )}
      <div className="border-line rounded-[6px] border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-[12.5px]" />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setCsv(template);
              }}
            >
              Load template
            </Button>
            <Button type="button" size="sm" onClick={doPreview} disabled={!csv.trim()}>
              Preview
            </Button>
          </div>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          className="border-line mono mt-3 w-full rounded-[5px] border bg-white p-2 text-[12px]"
          placeholder="Paste CSV here…"
        />
      </div>

      {preview && (
        <div className="border-line overflow-hidden rounded-[6px] border bg-white">
          <header className="border-line bg-tile border-b px-4 py-3">
            <h2 className="text-[13px] font-semibold tracking-[-0.01em]">
              Preview ({preview.length} of first 10 rows)
            </h2>
          </header>
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-mute border-line border-b text-left text-[11px] uppercase tracking-[0.06em]">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Legal name</th>
                <th className="px-3 py-2">GSTIN</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((p, i) => (
                <tr key={i} className="border-line border-b last:border-b-0">
                  <td className="mono text-mute px-3 py-2">{i + 1}</td>
                  <td className="px-3 py-2">{p.data?.legalName}</td>
                  <td className="mono px-3 py-2">{p.data?.gstin || '—'}</td>
                  <td className="px-3 py-2">{p.data?.state || '—'}</td>
                  <td className="px-3 py-2">{p.data?.type || 'retailer'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-line flex justify-end gap-2 border-t px-4 py-3">
            <Button type="button" size="sm" variant="primary" onClick={doImport} disabled={busy}>
              {busy ? 'Importing…' : 'Confirm import (atomic)'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
