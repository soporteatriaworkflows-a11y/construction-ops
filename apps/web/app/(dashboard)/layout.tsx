/**
 * Layout autenticado del dashboard.
 * Server Component — sin estado de cliente.
 * Propiedad: agent-frontend-boq. Refresh visual: UI/Branding ICONIC V1.
 */
import type { ReactNode } from 'react';
import { readModelModeLabel } from '@/lib/utils/mode-label';
import { getActiveWorkspace } from '@/lib/branding/workspace';
import { AppRail } from '@/components/shared/app-rail';
import { FloatingWorkflowDock } from '@/components/shared/floating-workflow-dock';
import { AppTopbar } from '@/components/shared/app-topbar';
import { ContextualNav } from '@/components/shared/contextual-nav';
import { resolveAccessActor, canManageAccess } from '@/server/access';
import { canUseQuoteAssistant } from '@/lib/access/surface-visibility';
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
  const quoteAssistantAvailable = canUseQuoteAssistant(actor.role);
  return (
    <div className="flex min-h-screen bg-app">
      {/* Rail de navegación flotante (compacto + hover-expand + pin). */}
      <AppRail
        canManageAccess={actor.canManageAccess}
        profileRole={actor.role}
        productName={ws.productName}
        workspaceName={ws.workspaceName}
        logoSymbol={ws.logoSymbol}
        modeLabel={mode.label}
        isFixture={mode.isFixture}
      />

      {/* Contenido principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar
          email={actor.email}
          role={actor.role}
          workspaceName={ws.workspaceName}
          canManageAccess={actor.canManageAccess}
          quoteAssistantAvailable={quoteAssistantAvailable}
        />

        {/* Navegación contextual del módulo activo (solo si aplica) */}
        <ContextualNav />

        <main className="flex-1 overflow-x-hidden" id="main-content" tabIndex={-1}>
          <div className="mx-auto max-w-screen-2xl px-6 py-6">{children}</div>
        </main>
      </div>

      {/* Asistente acompañante de cotización (aditivo, fixed, no afecta el flujo) */}
      {quoteAssistantAvailable && <QuoteCompanion />}

      {/* Workflow companion flotante (compacto) — fuera del dashboard. Se auto-oculta en /dashboard. */}
      <FloatingWorkflowDock profileRole={actor.role} />
    </div>
  );
}
