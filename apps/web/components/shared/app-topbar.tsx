/**
 * app-topbar.tsx — Topbar global del shell (ICONIC_OPS_UIX_SHELL_V1, Fase 1).
 *
 * Server Component (sin estado). Compone: migas de pan (contexto de página),
 * chip de workspace y menú de cuenta. Recibe los datos del actor YA resueltos
 * por el layout (server-side). SOLO presentación.
 */
import { Search } from 'lucide-react';
import { WorkspaceBrand } from '@/components/shared/workspace-brand';
import { Breadcrumbs } from '@/components/shared/breadcrumbs';
import { AccountMenu } from '@/components/shared/account-menu';

interface Props {
  email: string | null;
  role: string | null;
  workspaceName: string;
  canManageAccess: boolean;
}

export function AppTopbar({ email, role, workspaceName, canManageAccess }: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-iconic-soft-blue/60 bg-white/80 px-6 backdrop-blur-md">
      <div className="flex min-w-0 items-center">
        <Breadcrumbs />
      </div>

      {/* Command/search bar — afordancia visual de búsqueda global (próximamente) */}
      <button
        type="button"
        title="Búsqueda global — próximamente"
        aria-label="Búsqueda global (próximamente)"
        className="hidden min-w-0 max-w-sm flex-1 items-center gap-2 rounded-lg border border-iconic-soft-blue/70 bg-iconic-gray/60 px-3 py-1.5 text-sm text-iconic-graphite/45 transition-colors hover:border-iconic-primary/40 hover:bg-white lg:flex"
      >
        <Search className="h-4 w-4 shrink-0 text-iconic-graphite/40" aria-hidden="true" />
        <span className="truncate">Buscar en ICONIC OPS…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-iconic-soft-blue bg-white px-1.5 py-0.5 font-mono text-[10px] text-iconic-graphite/50 xl:inline">⌘K</kbd>
      </button>

      <div className="flex shrink-0 items-center gap-3">
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
