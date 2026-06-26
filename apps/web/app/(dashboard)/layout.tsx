/**
 * Layout autenticado del dashboard.
 * Server Component — sin estado de cliente.
 * Propiedad: agent-frontend-boq. Refresh visual: UI/Branding ICONIC V1.
 */
import type { ReactNode } from 'react';
import { readModelModeLabel } from '@/lib/utils/mode-label';
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { WorkspaceBrand } from '@/components/shared/workspace-brand';
import { SidebarNav } from '@/components/shared/sidebar-nav';
import { AppTopbar } from '@/components/shared/app-topbar';
import { ContextualNav } from '@/components/shared/contextual-nav';
import { resolveAccessActor, canManageAccess } from '@/server/access';
import { QuoteCompanion } from './_components/quote-companion';

/**
 * Render REQUEST-TIME de todo el segmento autenticado. La app va detrás de auth
 * (proxy) y su contenido depende del viewer y del modo (`READ_MODEL_SOURCE`)
 * resueltos en runtime; no debe prerenderizarse estáticamente.
 */
export const dynamic = 'force-dynamic';

/**
 * Resuelve el actor (email/rol) y si puede gestionar accesos. SOLO lectura del
 * resolver server-side existente; degrada a anónimo si falla (deny-by-default).
 */
async function resolveShellActor(): Promise<{
  email: string | null;
  role: string | null;
  canManageAccess: boolean;
}> {
  try {
    const actor = await resolveAccessActor();
    return {
      email: actor.email ?? null,
      role: actor.profileRole ?? null,
      canManageAccess: canManageAccess(actor.profileRole),
    };
  } catch {
    return { email: null, role: null, canManageAccess: false };
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const mode = readModelModeLabel();
  const ws = getActiveWorkspace();
  const actor = await resolveShellActor();
  return (
    <div className="flex min-h-screen bg-app">
      {/* Rail primario — azul noche ICONIC con profundidad. Sticky: acompaña el scroll. */}
      <aside
        className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-white/10"
        style={{ background: 'linear-gradient(180deg, #020148 0%, #050a3a 55%, #0a1145 100%)' }}
        aria-label="Navegación principal"
      >
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          <WorkspaceBrand variant="sidebar" />
        </div>

        <SidebarNav canManageAccess={actor.canManageAccess} />

        {/* Footer — tarjeta de workspace + estado de datos (request-time) */}
        <div className="border-t border-white/10 p-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <p className="truncate text-[11px] font-semibold text-white/85">{ws.workspaceName}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-iconic-soft-blue/70">
              <span
                className={`h-1.5 w-1.5 rounded-full ${mode.isFixture ? 'bg-amber-400' : 'bg-iconic-cyan'}`}
                style={mode.isFixture ? undefined : { boxShadow: '0 0 6px 1px rgba(0,184,255,0.7)' }}
                aria-hidden="true"
              />
              {mode.label}
            </p>
          </div>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          email={actor.email}
          role={actor.role}
          workspaceName={ws.workspaceName}
          canManageAccess={actor.canManageAccess}
        />

        {/* Navegación contextual del módulo activo (solo si aplica) */}
        <ContextualNav />

        <main className="flex-1 overflow-x-hidden" id="main-content" tabIndex={-1}>
          <div className="mx-auto max-w-screen-2xl px-6 py-6">{children}</div>
        </main>
      </div>

      {/* Asistente acompañante de cotización (aditivo, fixed, no afecta el flujo) */}
      <QuoteCompanion />
    </div>
  );
}
