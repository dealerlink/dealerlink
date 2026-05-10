import type { ReactNode } from 'react';

import { Shell } from '@/components/shell';

// Day 2 will add auth guard here via Lucia session check
export default function AppLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
