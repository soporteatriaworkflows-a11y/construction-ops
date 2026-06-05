/**
 * Detalle básico de alcance — /projects/[id]/scopes/[scopeId] (4B.2).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/SCOPES_CRUD_CONTRACT.md §7`.
 *
 * - Server Component, request-time (`resolveViewer()` + layout force-dynamic).
 * - Cross-org / inexistente ⇒ `notFound()` (404 amable). RLS es la barrera real.
 * - Verifica que el alcance pertenezca al proyecto de la ruta (defensa).
 * - Sin presupuesto (placeholder honesto para la siguiente fase).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Tag,
  Layers,
  Calendar,
  FileText,
  FolderOpen,
  ClipboardList,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDate, formatDateTime } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getScopesWriteRepository, ScopeNotFoundError } from '@/server/scopes';
import { getEstimatesWriteRepository } from '@/server/estimates';
import type { EstimateListItem } from '@/server/estimates';
import { isCreationModeEnabled } from '../../../mode-guard';
import { SCOPE_TYPE_LABELS } from '../../scope-labels';

interface PageProps {
  params: Promise<{ id: string; scopeId: string }>;
}

export default async function ScopeDetailPage({ params }: PageProps) {
  const { id, scopeId } = await params;
  const backHref = `/projects/${id}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  let scope: Awaited<ReturnType<ReturnType<typeof getScopesWriteRepository>['getScopeById']>>;
  try {
    scope = await getScopesWriteRepository().getScopeById(viewer, scopeId);
  } catch (e) {
    if (e instanceof ScopeNotFoundError) notFound();
    notFound();
  }

  // Defensa: el alcance debe pertenecer al proyecto de la ruta.
  if (scope.projectId !== id) {
    notFound();
  }

  // Cargar presupuestos del alcance (RLS-bound; cross-org ⇒ []).
  let estimates: EstimateListItem[] = [];
  let estimatesError: string | null = null;
  try {
    estimates = await getEstimatesWriteRepository().listEstimatesByScope(viewer, scopeId);
  } catch (e) {
    estimatesError = e instanceof Error ? e.message : 'Error al cargar presupuestos';
  }

  const canCreateEstimate = isCreationModeEnabled();
  const newEstimateHref = `/projects/${id}/scopes/${scopeId}/estimates/new`;
  const estimateHref = (estimateId: string) =>
    `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}`;

  return (
    <div>
      <PageHeader
        title={scope.name}
        breadcrumb={
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al proyecto
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                {scope.code}
              </span>
              <Badge variant="secondary">
                <Layers className="mr-1 h-3 w-3" aria-hidden="true" />
                {SCOPE_TYPE_LABELS[scope.scopeType]}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Tag className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="sr-only">Estado:</span>
              {scope.status === 'active' ? 'Activo' : 'Archivado'}
            </div>

            <div className="flex items-start gap-2 text-sm text-gray-700">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span>
                <span className="sr-only">Proyecto: </span>
                <Link href={backHref} className="text-blue-700 hover:underline">
                  Ver proyecto
                </Link>
              </span>
            </div>

            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span>
                <span className="sr-only">Creado: </span>
                Creado el {formatDateTime(scope.createdAt)}
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
            {scope.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                <span className="sr-only">Descripción del alcance: </span>
                {scope.description}
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
      {/* Presupuestos del alcance (4B.3)                                      */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Presupuestos del alcance" className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            <ClipboardList className="h-4 w-4 text-gray-500" aria-hidden="true" />
            Presupuestos
          </h2>
          {canCreateEstimate ? (
            <Button asChild size="sm">
              <Link href={newEstimateHref}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo presupuesto
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
              Nuevo presupuesto
            </Button>
          )}
        </div>

        {estimatesError ? (
          <div
            className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            role="alert"
            aria-live="assertive"
          >
            Error al cargar presupuestos: {estimatesError}
          </div>
        ) : estimates.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Sin presupuestos"
            description="Este alcance todavía no tiene presupuestos registrados."
            action={
              canCreateEstimate ? (
                <Button asChild size="sm">
                  <Link href={newEstimateHref}>Crear primer presupuesto</Link>
                </Button>
              ) : (
                <Button size="sm" disabled>
                  Crear primer presupuesto
                </Button>
              )
            }
          />
        ) : (
          <ul role="list" className="space-y-3">
            {estimates.map((estimate) => (
              <li key={estimate.id}>
                <Link
                  href={estimateHref(estimate.id)}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                        {estimate.code}
                      </span>
                      {estimate.status === 'active' && (
                        <Badge variant="success">Vigente</Badge>
                      )}
                      {estimate.status === 'archived' && (
                        <Badge variant="outline">Archivado</Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate font-medium text-gray-900">{estimate.name}</p>
                    <p className="text-xs text-gray-400">
                      Creado: {formatDate(estimate.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
