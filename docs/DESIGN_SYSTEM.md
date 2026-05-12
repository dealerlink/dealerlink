# Design System — The Non-Negotiables

> **Scope:** Design tokens, typography, component principles, and prototype mapping. Back to [CLAUDE.md](../CLAUDE.md).

The design prototype (`Dealerlink.html`) is the **visual source of truth**. Match it pixel-perfectly. Aesthetic direction: _quiet precision_ — dense, editorial, instrument-like.

## Tokens (`apps/web/app/globals.css`)

```css
:root {
  --ink: #0b0f1a;
  --ink-2: #1a2030;
  --paper: #f7f7f4;
  --paper-2: #efefea;
  --line: #e3e3dc;
  --line-2: #d5d5cc;
  --mute: #6b7280;
  --mute-2: #94928a;
  --accent: #3730a3; /* deep indigo, primary action */
  --accent-2: #4f46e5;
  --accent-soft: #eef2ff;
  --emerald: #047857;
  --amber: #b45309;
  --rose: #b91c1c;
  --tile: #fbfbf8;
}
```

## Typography rules

- **Inter** for all UI text. Italic for editorial moments (greetings, artboard labels, layer summaries).
- **IBM Plex Mono** for _every_ number, count, currency, ID, timestamp, GSTIN. Always with `font-feature-settings: "tnum", "zero"` (tabular figures).
- Currency display: `₹3.42 Cr`, `₹47.80 L`, `₹14,82,000`. Use `formatINR()` from `lib/format/`. Auto-scale to lakh/crore for values ≥ 1 lakh.
- Editorial italic only for: dashboard greeting, artboard titles, layer summaries, "vs last period" subtitles. Don't sprinkle.

## Component principles

- **Hairline borders, not shadows.** `box-shadow: inset 0 0 0 1px var(--line)` for cards. Drop shadows only for elevated paper (PDF preview pane).
- **6px corner radius** on cards, 4px on chips, 3px on kbd/badges.
- **56px row height** in dense tables. Don't go below 48px.
- **232px sidebar width.** Don't change.
- **Ink (`#0B0F1A`) is the primary action color**, accent (`#3730A3`) is for forward/destructive emphasis. The design avoids primary indigo buttons except for high-stakes actions like "New deal" or "Send quotation".
- **Status dots before chip text:** `<span class="dot s-em"/> Active`. Six states: emerald (em), amber (am), rose (ro), indigo (in), mute (mu), ink.
- **Sparklines and small charts:** hand-rolled SVG. See `Dashboard.KPI` component in prototype.
- **Tremor** for the dashboard's larger funnel + aging charts. Restyle defaults to use design tokens.

## Layouts to copy directly

The 12 screens in the prototype are the spec. When implementing each route, **open the corresponding section of `Dealerlink.html` or `screens-extra.jsx` first**. The class names use Tailwind, so most translate 1:1.
