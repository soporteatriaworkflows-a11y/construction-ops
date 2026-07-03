/**
 * app-topbar.tsx — Topbar global del shell (ICONIC_OPS_UIX_SHELL_V1, Fase 1).
 *
 * Server Component (sin estado). Compone: migas de pan (contexto de página),
 * chip de workspace y menú de cuenta. Recibe los datos del actor YA resueltos
 * por el layout (server-side). SOLO presentación.
 */
import { WorkspaceBrand } from '@/components/shared/workspace-brand';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { AccountMenu } from '@/components/shared/account-menu';
import { CommandPalette } from '@/components/shared/command-palette';
import { QuoteCompanionTopbarTrigger } from '@/app/(dashboard)/_components/quote-companion-trigger';

interface Props {
  email: string | null;
  role: string | null;
  workspaceName: string;
  canManageAccess: boolean;
  quoteAssistantAvailable?: boolean;
}

export function AppTopbar({
  email,
  role,
  workspaceName,
  canManageAccess,
  quoteAssistantAvailable = false,
}: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-iconic-soft-blue/60 bg-white/80 px-6 backdrop-blur-md dark:border-line dark:bg-surface">
      <div className="flex min-w-0 items-center">
        <Breadcrumbs />
      </div>

      {/* Command/search bar — búsqueda global funcional (Ctrl/⌘ K). */}
      <CommandPalette canManageAccess={canManageAccess} profileRole={role} />

      <div className="flex shrink-0 items-center gap-3">
        {quoteAssistantAvailable && <QuoteCompanionTopbarTrigger />}
        <WorkspaceBrand variant="chip" className="hidden md:inline-flex" />
        <span className="hidden h-6 w-px bg-iconic-soft-blue/60 md:inline-block" aria-hidden="true" />
        <AccountMenu
          email={email}
          role={role}
          workspaceName={workspaceName}
          canManageAccess={canManageAccess}
        />
      </div>
    </header>
  );
}
