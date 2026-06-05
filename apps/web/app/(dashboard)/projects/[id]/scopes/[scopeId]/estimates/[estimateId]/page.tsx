/**
 * Detalle básico de presupuesto — .../estimates/[estimateId] (4B.3).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/ESTIMATES_CRUD_CONTRACT.md §7`.
 *
 * - Server Component, request-time (`resolveViewer()` + layout force-dynamic).
 * - Cross-org / inexistente ⇒ `notFound()`. RLS es la barrera real.
 * - Verifica que el presupuesto pertenezca al alcance/proyecto de la ruta.
 * - Muestra la versión activa (V01), 0 capítulos y 0 ítems, y placeholder honesto
 *   de importación de Excel (siguiente fase).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Tag,
  Calendar,
  FileText,
  Layers,
  FolderOpen,
  ListTree,
  Hash,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EstimateVersionBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import { formatVersionLabel } from '../../estimate-format';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string }>;
}

export default async function EstimateDetailPage({ params }: PageProps) {
  const { id, scopeId, estimateId } = await params;
  const scopeHref = `/projects/${id}/scopes/${scopeId}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  let estimate: Awaited<
    ReturnType<ReturnType<typeof getEstimatesWriteRepository>['getEstimateById']>
  >;
  try {
    estimate = await getEstimatesWriteRepository().getEstimateById(viewer, estimateId);
  } catch (e) {
    if (e instanceof EstimateNotFoundError) notFound();
    notFound();
  }

  // Defensa: el presupuesto debe pertenecer al alcance/proyecto de la ruta.
  if (estimate.projectScopeId !== scopeId) {
    notFound();
  }

  const active = estimate.activeVersion;

  return (
    <div>
      <PageHeader
        title={estimate.name}
        breadcrumb={
          <Link
            href={scopeHref}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al alcance
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
                {estimate.code}
              </span>
              {estimate.status === 'active' && <Badge variant="success">Vigente</Badge>}
              {estimate.status === 'archived' && <Badge variant="outline">Archivado</Badge>}
              {estimate.status === 'draft' && <Badge variant="secondary">Borrador</Badge>}
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Tag className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span className="sr-only">Estado:</span>
              {estimate.status === 'active'
                ? 'Presupuesto de trabajo vigente'
                : estimate.status === 'archived'
                  ? 'Archivado'
                  : 'Borrador'}
            </div>

            {estimate.scopeName && (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <Layers className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                <span>
                  <span className="sr-only">Alcance: </span>
                  <Link href={scopeHref} className="text-blue-700 hover:underline">
                    {estimate.scopeName}
                  </Link>
                </span>
              </div>
            )}

            <div className="flex items-start gap-2 text-sm text-gray-700">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span>
                <span className="sr-only">Proyecto: </span>
                <Link href={`/projects/${id}`} className="text-blue-700 hover:underline">
                  {estimate.projectName ?? 'Ver proyecto'}
                </Link>
              </span>
            </div>

            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <span>
                <span className="sr-only">Creado: </span>
                Creado el {formatDateTime(estimate.createdAt)}
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
            {estimate.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                <span className="sr-only">Descripción del presupuesto: </span>
                {estimate.description}
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

      {/* Versión activa + conteos */}
      <section aria-label="Versión activa" className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-600">
          Versión activa
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-xs text-gray-400">Versión</p>
                <p className="text-lg font-bold text-gray-900">
                  {active ? formatVersionLabel(active.versionNumber) : '—'}
                </p>
              </div>
              {active && <EstimateVersionBadge status={active.status} />}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-xs text-gray-400">Capítulos</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  {active ? active.chapterCount : 0}
                </p>
              </div>
              <ListTree className="h-5 w-5 text-gray-300" aria-hidden="true" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-xs text-gray-400">Ítems</p>
                <p className="text-lg font-bold text-gray-900 tabular-nums">
                  {active ? active.itemCount : 0}
                </p>
              </div>
              <Hash className="h-5 w-5 text-gray-300" aria-hidden="true" />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Importación de Excel: siguiente fase (4C) */}
      <div
        className="mt-6 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700"
        role="status"
      >
        La importación del Excel estará disponible en la siguiente fase.
      </div>
    </div>
  );
}
