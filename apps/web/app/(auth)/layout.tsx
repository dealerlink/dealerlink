import type { ReactNode } from 'react';

// (auth) route group has no Shell wrapper. Plain html shell + page chrome.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
