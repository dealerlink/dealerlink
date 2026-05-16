import type { ReactNode } from 'react';

import type { Metadata } from 'next';
import { IBM_Plex_Mono, Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  // Per-page `metadata.title` strings render as "<page> · Dealerlink".
  title: {
    default: 'Dealerlink',
    template: '%s · Dealerlink',
  },
  description: 'Distributor CRM — built for India',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${ibmPlexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
