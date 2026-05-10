// Tailwind preset — used in apps/web/tailwind.config.ts
// Typed loosely because tailwindcss is a devDep of apps/web, not this package.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const dealerlinkPreset: Record<string, any> = {
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        line: 'var(--line)',
        'line-2': 'var(--line-2)',
        mute: 'var(--mute)',
        'mute-2': 'var(--mute-2)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        'accent-soft': 'var(--accent-soft)',
        emerald: 'var(--emerald)',
        amber: 'var(--amber)',
        rose: 'var(--rose)',
        tile: 'var(--tile)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        hairline: 'inset 0 0 0 1px var(--line)',
        paper: '0 1px 0 rgba(0,0,0,0.04), 0 12px 30px -12px rgba(0,0,0,0.18)',
      },
    },
  },
};
