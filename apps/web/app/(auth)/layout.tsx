import type { ReactNode } from 'react';
import { getActiveWorkspace } from '@/lib/branding/workspace';

export default function AuthLayout({ children }: { children: ReactNode }) {
  const ws = getActiveWorkspace();
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-iconic-navy px-4 py-10">
      {/* Acento de marca sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          background:
            'radial-gradient(60rem 30rem at 50% -10%, #00B8FF 0%, transparent 60%), radial-gradient(40rem 24rem at 100% 100%, #005DD6 0%, transparent 55%)',
        }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md">
        {children}
        <p className="mt-6 text-center text-xs text-iconic-soft/70">
          {ws.productName} · {ws.workspaceName}
        </p>
      </div>
    </div>
  );
}
