import { getAuthContext } from '@/lib/auth/session';

function timeOfDay(date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const hour = date.getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  const firstName = ctx?.user.fullName.split(' ')[0] ?? 'there';
  const tod = timeOfDay();

  return (
    <div className="px-6 py-5">
      <div className="titlecaps mb-1">Overview</div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">
        Good <span className="editorial font-normal">{tod}</span>, {firstName}.{' '}
        <span className="editorial text-mute font-normal">Dashboard coming in Week 2.</span>
      </h1>
    </div>
  );
}
