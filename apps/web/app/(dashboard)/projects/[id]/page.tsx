/**
 * Detalle básico de proyecto — /projects/[id] (4B.1).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/PROJECTS_CRUD_CONTRACT.md §7`.
 *
 * - Server Component.
 * - Viewer resuelto por modo (`resolveViewer()`): db=autenticado, fixture=demo.
 * - Cross-org / inexistente ⇒ `notFound()` (404 amable de Next).
 * - Sin presupuesto, sin edición (fuera de alcance 4B.1).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  FileText,
  Tag,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';
import { getProjectsWriteRepository, ProjectNotFoundError } from '@/server/projects';
import { resolveViewer } from '@/server/auth/resolve-viewer';

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = await params;

  // Resolver viewer por modo (supabase=autenticado, demo=fixture)
  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    // Sin sesión en modo supabase ⇒ el proxy ya debería haber redirigido.
    // Si llegamos aquí de todas formas, mostrar 404 amable (no exponer estado interno).
    notFound();
  }

  // Obtener detalle del proyecto
  let project: Awaited<ReturnType<
    ReturnType<typeof getProjectsWriteRepository>['getProjectById']
  >>;
  try {
    const repo = getProjectsWriteRepository();
    project = await repo.getProjectById(viewer, id);
  } catch (e) {
    if (e instanceof ProjectNotFoundError) {
      notFound();
    }
    // Error inesperado de infraestructura: también 404 amable
    notFound();
  }

  return (
    <div>
      <PageHeader
        title={project.name}
        breadcrumb={
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Proyectos
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Información general */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Información general</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Estado */}
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="sr-only">Estado:</span>
              <ProjectStatusBadge status={project.status} />
            </div>

            {/* Ciudad */}
            {project.city && (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                  aria-hidden="true"
                />
                <span>
                  <span className="sr-only">Ciudad: </span>
                  {project.city}
                </span>
              </div>
            )}

            {/* Fecha de creación */}
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Calendar
                className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
                aria-hidden="true"
              />
              <span>
                <span className="sr-only">Creado: </span>
                Creado el {formatDateTime(project.createdAt)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Descripción */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Descripción</CardTitle>
          </CardHeader>
          <CardContent>
            {project.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                <span className="sr-only">Descripción del proyecto: </span>
                {project.description}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Sin descripción</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Nota: alcances y presupuesto en oleadas posteriores */}
      <div
        className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700"
        role="status"
      >
        Presupuestos y alcances disponibles en versiones futuras del sistema.
      </div>
    </div>
  );
}
