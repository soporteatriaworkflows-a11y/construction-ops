/**
 * Página de proyectos — Oleada 3A.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model canónico (@/server/read-model) en lugar de mocks estáticos.
 * NO importa @/lib/utils/mocks. NO calcula totales financieros.
 */
import Link from 'next/link';
import { FolderOpen, MapPin, Calendar, Plus, Layers, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
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
import { getReadModel, getDemoViewer } from '@/server/read-model';

export default async function ProjectsPage() {
  const rm = getReadModel();
  const viewer = getDemoViewer();
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

  return (
    <div>
      <PageHeader
        title="Proyectos"
        description="Gestión de proyectos de construcción y sus alcances"
        actions={
          <Button size="sm" disabled aria-disabled="true" title="Disponible próximamente">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nuevo proyecto
          </Button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="Sin proyectos"
          description="Aún no hay proyectos registrados en esta organización."
          action={
            <Button size="sm" disabled>
              Crear primer proyecto
            </Button>
          }
        />
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
                  {/* Enlaza al primer alcance del proyecto (primer piso) */}
                  <Link href={`/estimates?projectId=${project.id}`}>
                    <Button variant="outline" size="sm">
                      Ver presupuesto
                    </Button>
                  </Link>
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
                    {project.scopeCount} alcance{project.scopeCount === 1 ? '' : 's'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                    {project.estimateCount} presupuesto{project.estimateCount === 1 ? '' : 's'}
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
