import type { ReactNode } from 'react';
import { getActiveWorkspace } from '@/lib/branding/workspace';

/**
 * Auth shell — composición ICONIC: bloque azul noche estructural a la izquierda
 * con curva amplia y detalle cian discreto; panel claro de acceso a la derecha.
 * Sobrio y premium (no landing). Propiedad: agent-frontend-boq. UI/Branding V1.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const ws = getActiveWorkspace();
  return (
    <div className="flex min-h-screen bg-iconic-gray">
      {/* Bloque de marca (curva amplia + acento cian) */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-iconic-ink lg:block">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: 'linear-gradient(135deg, #020148 0%, #013E97 60%, #005DD6 100%)' }}
          aria-hidden="true"
        />
        {/* Curva amplia inferior */}
        <svg className="absolute inset-x-0 bottom-0 h-40 w-full text-iconic-gray" viewBox="0 0 1440 160" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,160 L0,64 C320,140 720,0 1440,96 L1440,160 Z" fill="currentColor" opacity="0.06" />
        </svg>
        {/* Detalle cian discreto */}
        <div className="pointer-events-none absolute -right-16 top-24 h-64 w-64 rounded-full bg-iconic-cyan/20 blur-3xl" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <span className="text-sm font-semibold tracking-wide text-iconic-soft-blue">{ws.workspaceName}</span>
          <div>
            <h2 className="text-3xl font-bold leading-tight">{ws.productName}</h2>
            <p className="mt-2 max-w-sm text-sm text-white/70">{ws.descriptor}. Profesional, técnico y confiable.</p>
            <span className="mt-6 inline-block h-1 w-16 rounded bg-iconic-cyan" aria-hidden="true" />
          </div>
          <span className="text-xs text-white/40">© {ws.workspaceName}</span>
        </div>
      </aside>

      {/* Panel de acceso */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {children}
          <p className="mt-6 text-center text-xs text-iconic-graphite/50">
            {ws.productName} · {ws.workspaceName}
          </p>
        </div>
      </div>
    </div>
  );
}
