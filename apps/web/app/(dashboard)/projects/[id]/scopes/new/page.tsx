/**
 * Formulario de creación de alcance — /projects/[id]/scopes/new (4B.2).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §7`.
 *
 * - Server Component: valida modo + visibilidad del proyecto antes de renderizar.
 * - Request-time (`resolveViewer()` lee cookies; layout fuerza dynamic). Defensa
 *   en profundidad: la server action conserva su propio guard.
 * - En demo/fixture o proyecto no visible: mensaje claro, sin formulario.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getProjectsWriteRepository, ProjectNotFoundError } from '@/server/projects';
import { isCreationModeEnabled } from '../../../mode-guard';
import { NewScopeForm } from './new-scope-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function NewScopePage({ params }: PageProps) {
  const { id } = await params;
  const backHref = `/projects/${id}`;

  // Señal dinámica intrínseca + defensa en profundidad: el proyecto debe ser
  // visible para el viewer (RLS). Sin sesión válida en supabase, el proxy redirige.
  try {
    const viewer = await resolveViewer();
    await getProjectsWriteRepository().getProjectById(viewer, id);
  } catch (e) {
    if (e instanceof ProjectNotFoundError) notFound();
    // Sin sesión válida en modo supabase: el proxy ya redirige a /login. Si se
    // llegara aquí, no se expone el formulario (la action conserva su guard).
  }

  const canCreate = isCreationModeEnabled();

  const breadcrumb = (
    <Link
      href={backHref}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Volver al proyecto
    </Link>
  );

  if (!canCreate) {
    return (
      <div>
        <PageHeader title="Nuevo alcance" breadcrumb={breadcrumb} />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
          aria-live="polite"
        >
          <strong>Modo demostración activo.</strong> La creación de alcances no está
          disponible en este modo. Se requiere{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">
            APP_AUTH_MODE=supabase
          </code>{' '}
          y{' '}
          <code className="rounded bg-amber-100 px-1 font-mono text-xs">
            READ_MODEL_SOURCE=db
          </code>
          .
        </div>
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al proyecto
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nuevo alcance"
        description="Completa los datos del alcance del proyecto."
        breadcrumb={breadcrumb}
      />
      <div className="max-w-lg">
        <NewScopeForm projectId={id} />
      </div>
    </div>
  );
}
