import { redirect } from 'next/navigation';

// Root redirects to dashboard (auth will gate this in Day 2)
export default function RootPage() {
  redirect('/dashboard');
}
