import type { ReactNode } from 'react';
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { getInstanceBranding } from '@/lib/branding/instance';

/**
 * Auth shell — ICONIC OPS LOGIN (instance-ready). Composición ICONIC: bloque
 * azul noche estructural con curva amplia y acento cian a la izquierda; panel
 * claro de acceso a la derecha. Responsive: en móvil el bloque de marca se
 * reemplaza por una franja de gradiente superior y la tarjeta lleva la
 * identidad. Referencia discreta "Powered by" de la plataforma subyacente.
 * Sobrio y premium (no landing). Propiedad: agent-frontend-boq.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const ws = getActiveWorkspace();
  const instance = getInstanceBranding();

  const poweredBy = instance.showPoweredBy ? (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block h-1 w-1 rounded-full bg-iconic-cyan/70" />
      Powered by <span className="font-medium tracking-wide">{instance.poweredByLabel}</span>
    </span>
  ) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-iconic-gray lg:flex-row">
      {/* Franja de marca móvil (el bloque lateral se oculta en pantallas pequeñas) */}
      <div
        className="h-1.5 w-full shrink-0 bg-gradient-to-r from-iconic-ink via-iconic-primary to-iconic-cyan lg:hidden"
        aria-hidden="true"
      />

      {/* Bloque de marca (curva amplia + acento cian) — solo escritorio */}
      <aside className="relative hidden w-1/2 overflow-hidden bg-iconic-ink lg:block">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{ background: 'linear-gradient(135deg, #020148 0%, #013E97 60%, #005DD6 100%)' }}
          aria-hidden="true"
        />
        {/* Curva amplia inferior */}
        <svg
          className="absolute inset-x-0 bottom-0 h-40 w-full text-iconic-gray"
          viewBox="0 0 1440 160"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,160 L0,64 C320,140 720,0 1440,96 L1440,160 Z" fill="currentColor" opacity="0.06" />
        </svg>
        {/* Detalles cian discretos */}
        <div className="pointer-events-none absolute -right-16 top-24 h-64 w-64 rounded-full bg-iconic-cyan/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 bottom-16 h-48 w-48 rounded-full bg-iconic-primary/30 blur-3xl" aria-hidden="true" />

        <div className="relative flex h-full flex-col justify-between p-10 text-white xl:p-14">
          <span className="text-sm font-semibold tracking-wide text-iconic-soft-blue">
            {ws.workspaceName}
          </span>
          <div>
            <h2 className="text-4xl font-bold leading-tight tracking-tight">{ws.productName}</h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/70">
              {ws.descriptor}. Profesional, técnico y confiable.
            </p>
            <span className="mt-6 inline-block h-1 w-16 rounded bg-iconic-cyan" aria-hidden="true" />
          </div>
          <div className="flex items-center justify-between gap-4 text-xs text-white/40">
            <span>© {ws.workspaceName}</span>
            {poweredBy && <span className="text-white/35">{poweredBy}</span>}
          </div>
        </div>
      </aside>

      {/* Panel de acceso */}
      <main className="flex w-full flex-1 items-center justify-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="w-full max-w-md">
          {children}
          <footer className="mt-6 space-y-1.5 text-center">
            <p className="text-xs text-iconic-graphite/50">
              {ws.productName} · {ws.workspaceName}
            </p>
            {poweredBy && (
              <p className="text-[11px] text-iconic-graphite/40 lg:hidden" data-testid="powered-by-mobile">
                {poweredBy}
              </p>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}
