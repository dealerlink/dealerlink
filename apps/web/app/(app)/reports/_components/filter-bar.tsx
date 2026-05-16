'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export interface SelectField {
  kind: 'select';
  name: string;
  label: string;
  options: { value: string; label: string }[];
  /** When true, an empty value is not offered (the field always has a value). */
  required?: boolean;
}

export interface DateField {
  kind: 'date';
  name: string;
  label: string;
}

export interface ToggleField {
  kind: 'toggle';
  name: string;
  label: string;
}

export type FilterField = SelectField | DateField | ToggleField;

/**
 * Shared report filter bar. Pushes every change into the URL search params so
 * the report page (a Server Component) re-runs the query. A pending transition
 * is exposed via the `data-pending` attribute for the loading skeleton.
 */
export function FilterBar({
  basePath,
  fields,
  values,
}: {
  basePath: string;
  fields: FilterField[];
  values: Record<string, string>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (name: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    startTransition(() => router.replace(`${basePath}?${next.toString()}`));
  };

  return (
    <div
      data-pending={pending ? 'true' : 'false'}
      className="border-line flex flex-wrap items-end gap-3 rounded-[6px] border bg-white p-3"
    >
      {fields.map((f) => {
        const id = `filter-${f.name}`;
        if (f.kind === 'toggle') {
          return (
            <label key={f.name} htmlFor={id} className="flex items-center gap-2 text-[12.5px]">
              <input
                id={id}
                type="checkbox"
                checked={values[f.name] === '1'}
                onChange={(e) => update(f.name, e.target.checked ? '1' : '')}
                className="border-line h-[15px] w-[15px] rounded-[3px]"
              />
              {f.label}
            </label>
          );
        }
        return (
          <div key={f.name} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-mute text-[11px] uppercase tracking-[0.05em]">
              {f.label}
            </label>
            {f.kind === 'date' ? (
              <input
                id={id}
                type="date"
                value={values[f.name] ?? ''}
                onChange={(e) => update(f.name, e.target.value)}
                className="border-line text-ink mono h-[34px] rounded-[5px] border bg-white px-2 text-[12.5px]"
              />
            ) : (
              <select
                id={id}
                value={values[f.name] ?? ''}
                onChange={(e) => update(f.name, e.target.value)}
                className="border-line text-ink h-[34px] rounded-[5px] border bg-white px-2 text-[12.5px]"
              >
                {!f.required && <option value="">All</option>}
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        );
      })}
      {pending && <span className="text-mute self-center text-[11px]">Updating…</span>}
    </div>
  );
}
