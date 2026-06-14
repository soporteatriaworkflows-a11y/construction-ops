/**
 * page.tsx — Crear grupo de cantidades (Quantity Workspace).
 * Server Component: resuelve alcances del proyecto y renderiza el formulario.
 */
import Link from 'next/link';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { WorkspaceForm } from './_components/workspace-form';

export const dynamic = 'force-dynamic';

export default async function NewWorkspaceGroupPage() {
  const rm = getReadModel();
  let scopes: { id: string; name: string }[] = [];
  let canCreate = false;
  let error: string | null = null;

  try {
    const viewer = await resolveViewer();
    canCreate = isCreationModeEnabled() && ['management', 'internal'].includes(viewer.role);
    const projects = await rm.listProjects(viewer);
    for (const p of projects) {
      const overview = await rm.getProjectOverview(viewer, p.id);
      if (overview) {
        for (const s of overview.scopes) {
          scopes.push({ id: s.id, name: `${p.name} / ${s.name}` });
        }
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar alcances';
  }

  return (
    <div>
      <PageHeader
        title="Nuevo grupo de cantidades"
        description="Crea cantidades manualmente y vincúlalas a APU/BOQ"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/quantities/workspace">Volver</Link>
          </Button>
        }
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {!canCreate ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="note">
          La creación de cantidades requiere modo Supabase con datos reales y rol de presupuestos.
        </div>
      ) : scopes.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          No hay alcances disponibles. Crea primero un proyecto y un alcance.
        </div>
      ) : (
        <WorkspaceForm scopes={scopes} />
      )}
    </div>
  );
}
