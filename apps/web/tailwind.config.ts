import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/design-tokens/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Design tokens mapped to CSS variables
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
      fontSize: {
        // Prototype-specific sizes
        '10.5': ['10.5px', { lineHeight: '1.4' }],
        '11': ['11px', { lineHeight: '1.4' }],
        '11.5': ['11.5px', { lineHeight: '1.5' }],
        '12.5': ['12.5px', { lineHeight: '1.5' }],
        '13': ['13px', { lineHeight: '1.5' }],
        '14': ['14px', { lineHeight: '1.5' }],
        '15': ['15px', { lineHeight: '1.5' }],
        '28': ['28px', { lineHeight: '1.2' }],
        '30': ['30px', { lineHeight: '1' }],
        '34': ['34px', { lineHeight: '1' }],
      },
      borderRadius: {
        // Design system: 6px cards, 4px chips, 3px badges
        card: '6px',
        chip: '4px',
        badge: '3px',
      },
      height: {
        // Topbar + row heights from prototype
        topbar: '52px',
        'row-dense': '56px',
        'row-compact': '48px',
        sidebar: '100vh',
      },
      width: {
        sidebar: '232px',
      },
      boxShadow: {
        // Hairline border — primary card treatment (no drop shadows on cards)
        hairline: 'inset 0 0 0 1px var(--line)',
        // Elevated paper (PDF preview pane only)
        paper: '0 1px 0 rgba(0,0,0,0.04), 0 12px 30px -12px rgba(0,0,0,0.18)',
      },
    },
  },
  plugins: [],
};

export default config;
