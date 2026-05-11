/**
 * Minimal CSV parser sufficient for bulk-import previews.
 * Handles quoted fields, embedded commas, embedded quotes ("" → "), CR/LF.
 * NOT a full RFC-4180 implementation — good enough for human-typed CSV from
 * Excel/Numbers/Google Sheets.
 */
export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

export function parseCSV(input: string): ParsedCSV {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      cur.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // last field
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  const headers = rows.shift() ?? [];
  // Trim empty trailing rows.
  while (rows.length > 0 && rows[rows.length - 1]!.every((c) => c.trim() === '')) {
    rows.pop();
  }
  return { headers: headers.map((h) => h.trim()), rows };
}

export function rowsToObjects<T extends Record<string, string>>(
  headers: string[],
  rows: string[][],
): T[] {
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj as T;
  });
}
