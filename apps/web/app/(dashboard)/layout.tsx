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
    <div className="flex min-h-screen bg-iconic-gray">
      {/* Rail primario — azul noche ICONIC, refinado. Sticky: acompaña el scroll. */}
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-iconic-ink" aria-label="Navegación principal">
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          <WorkspaceBrand variant="sidebar" />
        </div>

        <SidebarNav canManageAccess={actor.canManageAccess} />

        {/* Footer — workspace + etiqueta de modo (request-time) */}
        <div className="space-y-0.5 border-t border-white/10 px-4 py-3">
          <p className="text-[11px] font-medium text-white/80">{ws.workspaceName}</p>
          <p className="text-[11px] text-iconic-soft-blue/60">{mode.label}</p>
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
    </div>
  );
}
