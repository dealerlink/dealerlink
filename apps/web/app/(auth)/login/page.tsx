import { headers } from 'next/headers';
import Link from 'next/link';

import { AuroraIllustration } from '@/components/auth/aurora';
import { extractTenantSlug, resolveTenantBySlug } from '@/lib/tenant/resolve';

import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Dealerlink' };

interface LoginPageProps {
  searchParams: { tenant?: string; from?: string };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const host = headers().get('host');
  const slug = extractTenantSlug(host, searchParams.tenant ?? null);
  const tenant = slug ? await resolveTenantBySlug(slug) : null;

  const tenantHeading = tenant ? `Sign in to ${tenant.displayName}` : 'Sign in to Dealerlink';

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2" style={{ background: '#0B0F1A' }}>
      {/* Left brand panel */}
      <div className="relative hidden flex-col overflow-hidden p-10 text-white lg:flex">
        <AuroraIllustration />

        <div className="relative flex items-center gap-2.5">
          <div className="relative h-[28px] w-[28px] rounded-[6px] bg-white">
            <span className="absolute inset-[3px] rounded-[3px] border border-[#0B0F1A]" />
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Dealerlink</span>
        </div>

        <div className="relative mt-auto">
          <div className="titlecaps !text-white/60">The operating console</div>
          <h2 className="editorial mt-3 max-w-[460px] text-[56px] font-normal leading-[1] tracking-[-0.02em]">
            One system of record for every transaction.
          </h2>
          <p className="mt-4 max-w-[420px] text-[14px] leading-relaxed text-white/70">
            Pipeline, inventory, paperwork, and payments — for distributors who&apos;d rather close
            the day than chase it.
          </p>

          <div className="mono mt-10 flex items-center gap-3 text-[11.5px] text-white/55">
            <span>SOC-2 type II</span>
            <span className="h-1 w-1 rounded-full bg-current opacity-50" />
            <span>ISO 27001</span>
            <span className="h-1 w-1 rounded-full bg-current opacity-50" />
            <span>Hosted in Bangalore · blr1</span>
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex flex-col bg-[#F7F7F4]">
        <div className="text-mute flex justify-end gap-2 p-5 text-[12px]">
          <span>New here?</span>
          <Link href="#" className="font-medium text-[var(--accent)] hover:underline">
            Request a demo →
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-[400px]">
            <div className="titlecaps">Sign in to your tenant</div>
            <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.02em]">
              {tenantHeading.split('to ')[0]}to{' '}
              <span className="editorial text-mute font-normal">
                {tenantHeading.split('to ')[1]}
              </span>
            </h1>
            <p className="editorial text-mute mt-3 text-[13.5px]">
              Welcome back. Sign in to continue.
            </p>

            <LoginForm tenantSlug={tenant?.slug ?? null} />

            <div className="mono text-mute-2 mt-8 text-[11.5px]">
              © 2026 Dealerlink ·{' '}
              <Link href="#" className="hover:underline">
                Privacy
              </Link>{' '}
              ·{' '}
              <Link href="#" className="hover:underline">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
