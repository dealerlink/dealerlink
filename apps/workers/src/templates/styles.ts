/**
 * Print stylesheet for Dealerlink document PDFs.
 *
 * Exported as a string and inlined into the rendered HTML's <head> — there
 * are NO external CSS files (Puppeteer needs everything inline for reliable
 * rendering, per docs/PDF_PIPELINE.md). The design tokens mirror the
 * prototype's print stylesheet (docs/Distribyte-print.html): deep-indigo
 * accent, hairline borders, Inter + IBM Plex Mono.
 */

export const QUOTATION_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: #0B0F1A;
    --ink-2: #1A2030;
    --mute: #6B7280;
    --line: #E3E3DC;
    --line-2: #D5D5CC;
    --accent: #3730A3;
    --tile: #FBFBF8;
    --emerald: #047857;
  }

  html, body {
    background: #FFFFFF;
    color: var(--ink);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 10px;
    line-height: 1.45;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .mono {
    font-family: 'IBM Plex Mono', ui-monospace, 'Courier New', monospace;
    font-variant-numeric: tabular-nums;
  }
  .num { text-align: right; }
  .muted { color: var(--mute); }
  .titlecaps {
    font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--mute); font-weight: 600;
  }

  /* ---- header band -------------------------------------------------- */
  .hdr {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 14px; border-bottom: 2px solid var(--ink);
  }
  .hdr-left { max-width: 58%; }
  .logo { max-height: 46px; max-width: 220px; display: block; margin-bottom: 8px; }
  .logo-fallback {
    font-size: 18px; font-weight: 700; letter-spacing: -0.02em;
    color: var(--accent); margin-bottom: 6px;
  }
  .tenant-name { font-size: 13px; font-weight: 700; letter-spacing: -0.01em; }
  .tenant-meta { color: var(--mute); margin-top: 2px; font-size: 9px; }
  .tenant-meta .mono { color: var(--ink-2); }

  .hdr-right { text-align: right; min-width: 38%; }
  .doc-title {
    font-size: 26px; font-weight: 700; letter-spacing: 0.04em;
    color: var(--accent); line-height: 1;
  }
  .doc-meta { margin-top: 10px; border-collapse: collapse; margin-left: auto; }
  .doc-meta td { padding: 1.5px 0 1.5px 14px; font-size: 9px; }
  .doc-meta td.k { color: var(--mute); text-align: right; }
  .doc-meta td.v { text-align: right; font-weight: 600; }
  .rev-badge {
    display: inline-block; background: var(--accent); color: #fff;
    border-radius: 3px; padding: 1px 6px; font-size: 8px; font-weight: 600;
    letter-spacing: 0.04em; margin-left: 6px;
  }

  /* ---- parties ------------------------------------------------------ */
  .parties { display: flex; gap: 12px; margin-top: 16px; }
  .party {
    flex: 1; border: 1px solid var(--line); border-radius: 5px;
    padding: 9px 11px; background: var(--tile);
  }
  .party-label { margin-bottom: 4px; }
  .party-name { font-weight: 700; font-size: 10.5px; }
  .party-line { color: var(--ink-2); font-size: 9px; }
  .party-gstin { margin-top: 3px; font-size: 9px; }
  .party-note { color: var(--mute); font-style: italic; font-size: 9px; }

  .badge {
    display: inline-block; border-radius: 3px; padding: 1px 6px;
    font-size: 8px; font-weight: 600; letter-spacing: 0.04em;
    border: 1px solid var(--line-2);
  }
  .badge.inter { background: #EEF2FF; color: var(--accent); border-color: #C7D2FE; }
  .badge.intra { background: #ECFDF5; color: var(--emerald); border-color: #A7F3D0; }

  /* ---- line items table -------------------------------------------- */
  .items { width: 100%; border-collapse: collapse; margin-top: 16px; }
  .items thead th {
    background: var(--ink); color: #fff; font-size: 8px; font-weight: 600;
    letter-spacing: 0.05em; text-transform: uppercase;
    padding: 6px 7px; text-align: left;
  }
  .items thead th.num { text-align: right; }
  .items tbody td {
    padding: 6px 7px; border-bottom: 1px solid var(--line);
    font-size: 9px; vertical-align: top;
  }
  .items tbody tr:nth-child(even) td { background: var(--tile); }
  .item-name { font-weight: 600; font-size: 9.5px; }
  .item-sub { color: var(--mute); font-size: 8px; }
  .items tfoot td {
    padding: 7px; font-weight: 700; font-size: 9px;
    border-top: 2px solid var(--ink);
  }

  /* ---- summary: amount-in-words + totals --------------------------- */
  .summary { display: flex; gap: 14px; margin-top: 14px; }
  .words {
    flex: 1; border: 1px solid var(--line); border-radius: 5px;
    padding: 10px 12px; background: var(--tile);
  }
  .words-value {
    margin-top: 4px; font-weight: 600; font-size: 10px; color: var(--ink-2);
  }
  .totals { width: 250px; border-collapse: collapse; }
  .totals td { padding: 3.5px 0; font-size: 9.5px; }
  .totals td.k { color: var(--mute); }
  .totals td.v { text-align: right; }
  .totals tr.rule td { border-top: 1px solid var(--line); }
  .totals tr.grand td {
    border-top: 2px solid var(--ink); padding-top: 7px;
    font-size: 13px; font-weight: 700;
  }
  .totals tr.grand td.k { color: var(--ink); }

  /* ---- terms + bank ------------------------------------------------- */
  .section { margin-top: 16px; }
  .section-body {
    border: 1px solid var(--line); border-radius: 5px; padding: 9px 12px;
    margin-top: 5px; font-size: 9px; white-space: pre-wrap; color: var(--ink-2);
  }
  .bank { margin-top: 16px; }
  .bank-grid {
    display: flex; gap: 26px; border: 1px solid var(--line);
    border-radius: 5px; padding: 9px 12px; margin-top: 5px;
  }
  .bank-item .k { font-size: 8px; }
  .bank-item .v { font-size: 9.5px; font-weight: 600; }

  /* page-break hygiene: keep summary + bank blocks intact */
  .summary, .bank, .words { break-inside: avoid; }
  .items thead { display: table-header-group; }
`;
