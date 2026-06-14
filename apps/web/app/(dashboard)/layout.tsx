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
import { resolveAccessActor, canManageAccess } from '@/server/access';

/**
 * Render REQUEST-TIME de todo el segmento autenticado. La app va detrás de auth
 * (proxy) y su contenido depende del viewer y del modo (`READ_MODEL_SOURCE`)
 * resueltos en runtime; no debe prerenderizarse estáticamente.
 */
export const dynamic = 'force-dynamic';

/** ¿El viewer puede gestionar accesos? (server-side; deny-by-default). */
async function resolveCanManageAccess(): Promise<boolean> {
  try {
    const actor = await resolveAccessActor();
    return canManageAccess(actor.profileRole);
  } catch {
    return false;
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const mode = readModelModeLabel();
  const ws = getActiveWorkspace();
  const showAccess = await resolveCanManageAccess();
  return (
    <div className="flex min-h-screen bg-iconic-gray">
      {/* Sidebar — estructura azul noche ICONIC */}
      <aside className="flex w-60 shrink-0 flex-col bg-iconic-ink" aria-label="Navegación principal">
        {/* Identidad del workspace */}
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          <WorkspaceBrand variant="sidebar" />
        </div>

        {/* Navegación con estado activo */}
        <SidebarNav canManageAccess={showAccess} />

        {/* Footer — workspace + etiqueta de modo (request-time) */}
        <div className="space-y-0.5 border-t border-white/10 px-4 py-3">
          <p className="text-[11px] font-medium text-white/80">{ws.workspaceName}</p>
          <p className="text-[11px] text-iconic-soft-blue/60">{mode.label}</p>
        </div>
      </aside>

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-iconic-soft-blue/60 bg-white/85 px-6 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-iconic-ink">{ws.productName}</span>
            <span className="hidden truncate text-xs text-iconic-graphite/50 sm:inline">· {ws.descriptor}</span>
          </div>
          <WorkspaceBrand variant="chip" />
        </header>

        <main className="flex-1 overflow-x-hidden" id="main-content" tabIndex={-1}>
          <div className="mx-auto max-w-screen-2xl px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
