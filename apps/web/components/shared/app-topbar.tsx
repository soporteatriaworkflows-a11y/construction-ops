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

interface Props {
  email: string | null;
  role: string | null;
  workspaceName: string;
  canManageAccess: boolean;
}

export function AppTopbar({ email, role, workspaceName, canManageAccess }: Props) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-iconic-soft-blue/60 bg-white/85 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center">
        <Breadcrumbs />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <WorkspaceBrand variant="chip" className="hidden md:inline-flex" />
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
