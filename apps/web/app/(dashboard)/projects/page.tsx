/**
 * Página de proyectos — Oleada 4B.1.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * - Viewer resuelto por modo (`resolveViewer()`): db=autenticado, fixture=demo.
 * - Botón "+ Nuevo proyecto" habilitado solo cuando APP_AUTH_MODE=supabase + READ_MODEL_SOURCE=db.
 * - Conserva estados loading/empty/error y diseño de tarjetas de 3A.
 * - NO calcula totales financieros.
 */
import Link from 'next/link';
import {
  FolderOpen,
  MapPin,
  Calendar,
  Plus,
  Layers,
  ClipboardList,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { OperationsHeader, OperationsHeaderAction } from '@/components/shared/operations-header';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from './mode-guard';

export default async function ProjectsPage() {
  // Viewer por modo: supabase=autenticado, demo=getDemoViewer()
  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch (e) {
    // Sin sesión en modo supabase: el proxy maneja el redirect; aquí muestra error amable.
    const errorMsg = e instanceof Error ? e.message : 'Error al resolver la sesión.';
    return (
      <div>
        <PageHeader title="Proyectos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          {errorMsg}
        </div>
      </div>
    );
  }

  const rm = getReadModel();
  let projects: Awaited<ReturnType<typeof rm.listProjects>> = [];
  let error: string | null = null;

  try {
    projects = await rm.listProjects(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar proyectos';
    projects = [];
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Proyectos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error al cargar proyectos: {error}
        </div>
      </div>
    );
  }

  // El botón se habilita solo cuando el modo permite creación real
  const canCreate = isCreationModeEnabled();

  return (
    <div>
      <OperationsHeader
        eyebrow="Proyectos"
        title="Proyectos y alcances"
        subtitle="Gestión de proyectos de construcción y sus alcances"
        stat={{ label: 'Proyectos', value: String(projects.length) }}
        actions={
          canCreate ? (
            <OperationsHeaderAction href="/projects/new" variant="primary">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo proyecto
            </OperationsHeaderAction>
          ) : (
            <span
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-white/50"
              aria-disabled="true"
              title="Disponible en modo supabase+db"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo proyecto
            </span>
          )
        }
      />

      {projects.length === 0 ? (
        viewer.role === 'client' ? (
          // V5.6.4: consulta sin proyectos asignados — estado deliberado, sin
          // CTA de creación (no puede crear) y sin insinuar que "no existen".
          <EmptyState
            icon={FolderOpen}
            title="Aún no tienes proyectos asignados"
            description="La persona que administra tu acceso puede asignarte proyectos desde Accesos. Cuando lo haga, los verás aquí."
          />
        ) : (
        <EmptyState
          icon={FolderOpen}
          title="Sin proyectos"
          description="Aún no hay proyectos registrados en esta organización."
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/projects/new">Crear primer proyecto</Link>
              </Button>
            ) : (
              <Button size="sm" disabled>
                Crear primer proyecto
              </Button>
            )
          }
        />
        )
      ) : (
        <div className="space-y-6">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <ProjectStatusBadge status={project.status} />
                    <CardTitle className="mt-1 text-lg">{project.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/projects/${project.id}`}>
                      <Button variant="outline" size="sm">
                        Ver detalle
                      </Button>
                    </Link>
                    <Link href={`/estimates?projectId=${project.id}`}>
                      <Button variant="outline" size="sm">
                        Ver presupuesto
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Metadata */}
                <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                  {project.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {project.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                    Creado: {formatDate(project.createdAt)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    {project.scopeCount} alcance
                    {project.scopeCount === 1 ? '' : 's'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                    {project.estimateCount} presupuesto
                    {project.estimateCount === 1 ? '' : 's'}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
