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
  Layers,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { OperationsHeader } from '@/components/shared/operations-header';
import { KpiCard, KpiBand } from '@/components/shared/kpi-card';
import { ProjectStatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { getProjectsWriteRepository, ProjectNotFoundError } from '@/server/projects';
import { getScopesWriteRepository } from '@/server/scopes';
import type { ScopeListItem } from '@/server/scopes';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '../mode-guard';
import { SCOPE_TYPE_LABELS } from './scope-labels';

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

  // Cargar alcances del proyecto (RLS-bound; cross-org ⇒ []).
  let scopes: ScopeListItem[] = [];
  let scopesError: string | null = null;
  try {
    scopes = await getScopesWriteRepository().listScopesByProject(viewer, id);
  } catch (e) {
    scopesError = e instanceof Error ? e.message : 'Error al cargar alcances';
  }

  const canCreateScope = isCreationModeEnabled();
  const newScopeHref = `/projects/${id}/scopes/new`;

  return (
    <div>
      <OperationsHeader
        eyebrow="Proyecto"
        title={project.name}
        subtitle={`Centro operativo${project.city ? ` · ${project.city}` : ''}`}
        stat={{ label: 'Alcances', value: String(scopes.length) }}
        breadcrumb={
          <Link href="/projects" className="inline-flex items-center gap-1 text-white/70 hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Proyectos
          </Link>
        }
      />

      {scopes.length > 0 && (
        <KpiBand className="mb-4 sm:grid-cols-3 lg:grid-cols-3">
          <KpiCard label="Alcances" value={scopes.length} />
          <KpiCard label="Activos" value={scopes.filter((s) => s.status === 'active').length} tone="ok" />
          <KpiCard label="Archivados" value={scopes.filter((s) => s.status === 'archived').length} />
        </KpiBand>
      )}

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

      {/* ------------------------------------------------------------------ */}
      {/* Alcances del proyecto (4B.2)                                         */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Alcances del proyecto" className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <Layers className="h-4 w-4 text-gray-500" aria-hidden="true" />
            Alcances
          </h2>
          {canCreateScope ? (
            <Button asChild size="sm">
              <Link href={newScopeHref}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo alcance
              </Link>
            </Button>
          ) : (
            <Button
              size="sm"
              disabled
              aria-disabled="true"
              title="Disponible en modo supabase+db"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo alcance
            </Button>
          )}
        </div>

        {scopesError ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
            aria-live="assertive"
          >
            Error al cargar alcances: {scopesError}
          </div>
        ) : scopes.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Sin alcances"
            description="Este proyecto todavía no tiene alcances registrados."
            action={
              canCreateScope ? (
                <Button asChild size="sm">
                  <Link href={newScopeHref}>Crear primer alcance</Link>
                </Button>
              ) : (
                <Button size="sm" disabled>
                  Crear primer alcance
                </Button>
              )
            }
          />
        ) : (
          <ul role="list" className="space-y-3">
            {scopes.map((scope) => (
              <li key={scope.id}>
                <Link
                  href={`/projects/${id}/scopes/${scope.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                        {scope.code}
                      </span>
                      <Badge variant="secondary">
                        {SCOPE_TYPE_LABELS[scope.scopeType]}
                      </Badge>
                      {scope.status === 'archived' && (
                        <Badge variant="outline">Archivado</Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate font-medium text-gray-900">{scope.name}</p>
                    <p className="text-xs text-gray-400">
                      Creado: {formatDate(scope.createdAt)}
                    </p>
                  </div>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-gray-400"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Presupuesto: disponible en la siguiente fase (4B.3) */}
      <div
        className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700"
        role="status"
      >
        El presupuesto del proyecto estará disponible en la siguiente fase.
      </div>
    </div>
  );
}
