'use client';

import { INDIAN_STATE_OPTIONS } from '@dealerlink/schemas';

/**
 * Indian-state dropdown. Shows the full state name to the user, submits the
 * ISO 3166-2:IN 2-letter code as the value (DEV.33). The single source of the
 * option list is `@dealerlink/schemas` — never hardcode state strings.
 */
export function StateSelect({
  value,
  onChange,
  includeEmpty = true,
  id,
  ariaLabel,
}: {
  /** Current code, or '' when unset. */
  value: string;
  onChange: (code: string) => void;
  includeEmpty?: boolean;
  id?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-line text-ink h-[34px] w-full rounded-[5px] border bg-white px-2 text-[13px]"
    >
      {includeEmpty && <option value="">—</option>}
      {INDIAN_STATE_OPTIONS.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
