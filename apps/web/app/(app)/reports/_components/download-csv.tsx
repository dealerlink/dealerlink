'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { ReportKey, ReportParams } from '@/lib/reports';

import { exportReportCsv } from '../actions';

/**
 * "Download CSV" button. Calls the `exportReportCsv` server action — the
 * report query and CSV serialisation happen server-side — then saves the
 * returned string as a file via an object URL.
 */
export function DownloadCsv({ report, params }: { report: ReportKey; params: ReportParams }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await exportReportCsv(report, params);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not generate the CSV. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="default" onClick={onClick} disabled={busy}>
        <Download size={13} />
        {busy ? 'Preparing…' : 'Download CSV'}
      </Button>
      {error && (
        <span role="alert" className="text-[11.5px] text-rose-700">
          {error}
        </span>
      )}
    </div>
  );
}
