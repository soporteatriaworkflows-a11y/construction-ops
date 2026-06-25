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
import { Suspense } from 'react';
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
  DollarSign,
  Upload,
  CheckCircle2,
  ChevronRight,
  Download,
  Plus,
  Pencil,
  ClipboardList,
  LayoutGrid,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EstimateVersionBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatCOP, formatDateTime } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import type { ChapterReviewItem } from '@/lib/estimates/review-types';
import type { AiuRatesView, FinancialSummary } from '@/lib/estimates/aiu-types';
import { isCreationModeEnabled } from '../../../../../mode-guard';
import { formatVersionLabel } from '../../estimate-format';
import { AiuForm } from './aiu-form';
import { ExportButtons, type ExportCounts } from './export-buttons';
import { getReadModel } from '@/server/read-model';
import {
  computeQuoteReadiness,
  readinessExportMessage,
  type QuoteReadiness,
} from '@/lib/estimates/quote-readiness';
import { QuoteReadinessSemaphore, ReadinessExportAlert } from './quote-readiness-semaphore';
import { getBudgetApuExportSelection } from '@/server/estimates/export/apu-annex';
import { ArchiveControls } from './archive-controls';
import { VersionPanel } from './version-panel';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EstimateDetailPage({ params, searchParams }: PageProps) {
  const { id, scopeId, estimateId } = await params;
  const sp = searchParams ? await searchParams : {};
  const justImported = sp['imported'] === '1';
  const justSaved = sp['saved'] === '1';
  const showArchived = sp['archived'] === '1';
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
  const hasContent = !!active && (active.chapterCount > 0 || active.itemCount > 0);
  const canImport = isCreationModeEnabled();
  const importHref = `${scopeHref}/estimates/${estimateId}/import`;

  const versionEditable = !!active && !['approved', 'issued', 'archived'].includes(active.status);
  const canEdit = canImport; // gate de modo (supabase+db)
  const canMutate = canEdit && versionEditable; // editable solo si la versión NO está emitida
  const canArchive = canMutate;

  // Versiones (emisión/clonación, 4E.3A).
  let versions: import('@/lib/estimates/version-types').EstimateVersionSummary[] = [];
  if (active) {
    try {
      versions = await getEstimatesWriteRepository().listEstimateVersions(viewer, estimateId);
    } catch {
      versions = [];
    }
  }

  // Capítulos del presupuesto (revisión operativa, 4D.1 + archive 4E.2B).
  let chapters: ChapterReviewItem[] = [];
  let chaptersError: string | null = null;
  if (hasContent || showArchived) {
    try {
      chapters = await getEstimatesWriteRepository().listChaptersByEstimateVersion(
        viewer,
        estimateId,
        { includeArchived: showArchived },
      );
    } catch (e) {
      chaptersError = e instanceof Error ? e.message : 'Error al cargar capítulos';
    }
  }
  const chaptersSectionVisible = hasContent || (showArchived && chapters.length > 0);
  const chapterHref = (chapterId: string) =>
    `${scopeHref}/estimates/${estimateId}/chapters/${chapterId}`;
  const chapterNewHref = `${scopeHref}/estimates/${estimateId}/chapters/new`;
  const chapterEditHref = (chapterId: string) =>
    `${scopeHref}/estimates/${estimateId}/chapters/${chapterId}/edit`;
  const archiveToggleHref = `${scopeHref}/estimates/${estimateId}${showArchived ? '' : '?archived=1'}`;

  // AIU + resumen financiero (4D.2). Solo si hay una versión activa.
  let aiu: AiuRatesView | null = null;
  let financialSummary: FinancialSummary | null = null;
  if (active) {
    try {
      const repo = getEstimatesWriteRepository();
      [aiu, financialSummary] = await Promise.all([
        repo.getEstimateVersionAiu(viewer, estimateId),
        repo.calculateEstimateFinancialSummary(viewer, estimateId),
      ]);
    } catch {
      aiu = null;
      financialSummary = null;
    }
  }

  // APU_QUOTE_READINESS_SEMAPHORE_V1: semáforo de cotización lista para exportar.
  // Consume el read-model (getEstimateDetail) sin recalcular finanzas ni bloquear
  // export. Degradación segura a null si el read-model falla.
  let readiness: QuoteReadiness | null = null;
  if (active) {
    try {
      const detail = await getReadModel().getEstimateDetail(viewer, estimateId);
      readiness = computeQuoteReadiness({
        estimate: detail.estimate,
        chapters: detail.chapters,
        items: detail.items,
      });
    } catch {
      readiness = null;
    }
  }

  // PERF (ICONIC_OPS_UX_BLOCKERS_V1): los conteos de export APU se resuelven vía
  // `getBudgetApuExportSelection`, que hoy hace N+1 (getApuDetail por APU) y bloqueaba
  // el render del presupuesto ~minutos. Se mueven FUERA de la ruta crítica con
  // Suspense streaming: la página pinta de inmediato y los conteos llegan después.
  // NO se modifica el motor de export (apu-annex); solo la estrategia de carga.

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

      {justImported && (
        <div
          className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Importación completada.
        </div>
      )}

      {justSaved && (
        <div
          className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Cambios guardados. El resumen, el AIU y el total general reflejan los datos actuales.
        </div>
      )}

      {/* Acceso al BOQ Workspace (Oleada OPERATIONAL BUDGET UX V1) */}
      {hasContent && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-iconic-soft-blue/60 bg-brand-50/60 px-4 py-3">
          <LayoutGrid className="h-5 w-5 text-iconic-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-iconic-ink">BOQ Workspace</p>
            <p className="text-xs text-gray-500">
              Vista densa con búsqueda, filtros, edición rápida, desglose por capítulos y simulador comercial.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href={`${scopeHref}/estimates/${estimateId}/workspace`}>
              Abrir workspace
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="text-xs text-gray-400">Total directo</p>
                <p className="text-lg font-bold text-blue-700 tabular-nums">
                  {formatCOP(active ? active.directTotal : '0')}
                </p>
              </div>
              <DollarSign className="h-5 w-5 text-gray-300" aria-hidden="true" />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Versiones: emitir / clonar (4E.3A)                                  */}
      {/* ------------------------------------------------------------------ */}
      {active && versions.length > 0 && (
        <section aria-label="Versiones" className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            <ClipboardList className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Versiones
          </h2>
          <VersionPanel estimateId={estimateId} versions={versions} canManage={canEdit} compareHref={`${scopeHref}/estimates/${estimateId}/compare`} />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Capítulos del presupuesto (revisión operativa, 4D.1)                */}
      {/* ------------------------------------------------------------------ */}
      {chaptersSectionVisible && (
        <section aria-label="Capítulos del presupuesto" className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
              <ListTree className="h-4 w-4 text-gray-400" aria-hidden="true" />
              Capítulos
            </h2>
            <div className="flex items-center gap-3">
              <Link href={archiveToggleHref} className="text-xs font-medium text-gray-500 hover:underline">
                {showArchived ? 'Ocultar archivados' : 'Mostrar archivados'}
              </Link>
              {canMutate ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={chapterNewHref}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nuevo capítulo
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled aria-disabled="true" title={versionEditable ? 'Disponible en modo supabase+db' : 'Versión emitida (inmutable)'}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuevo capítulo
                </Button>
              )}
            </div>
          </div>
          {chaptersError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              Error al cargar capítulos: {chaptersError}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm" aria-label="Tabla de capítulos">
                <thead className="bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 text-right font-medium">Ítems</th>
                    <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {chapters.map((ch) => (
                    <tr key={ch.id} className={`hover:bg-gray-50 ${ch.archived ? 'bg-gray-50/60 text-gray-400' : ''}`}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-gray-600">{ch.code}</span>
                        {ch.archived && (
                          <span className="ml-1.5 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-medium text-gray-600">
                            Archivado
                          </span>
                        )}
                        {!ch.archived && ch.sourceCode && ch.sourceCode !== ch.code && (
                          <span
                            className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700"
                            title={`Código original: ${ch.sourceCode}${ch.sourceRow ? ` (fila ${ch.sourceRow})` : ''}`}
                          >
                            normalizado
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-900">{ch.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-600">{ch.itemCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCOP(ch.subtotal)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-3">
                          {canArchive && (
                            <ArchiveControls kind="chapter" estimateId={estimateId} targetId={ch.id} archived={ch.archived} canWrite={canArchive} />
                          )}
                          {canMutate && !ch.archived && (
                            <Link href={chapterEditHref(ch.id)} className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-600 hover:underline">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Editar
                            </Link>
                          )}
                          {!ch.archived && (
                            <Link href={chapterHref(ch.id)} className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-700 hover:underline">
                              Ver detalle
                              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* AIU y costos indirectos (4D.2)                                      */}
      {/* ------------------------------------------------------------------ */}
      {hasContent && aiu && financialSummary && (
        <section aria-label="AIU y costos indirectos" className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            <DollarSign className="h-4 w-4 text-gray-400" aria-hidden="true" />
            AIU y costos indirectos
          </h2>
          <AiuForm
            estimateId={estimateId}
            aiu={aiu}
            directTotal={financialSummary.directTotal}
            serverSummary={financialSummary}
          />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Semáforo de cotización (APU_QUOTE_READINESS_SEMAPHORE_V1)           */}
      {/* ------------------------------------------------------------------ */}
      {hasContent && readiness && (
        <section aria-label="Estado de la cotización" className="mt-8">
          <QuoteReadinessSemaphore readiness={readiness} />
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Exportar presupuesto (4E.1)                                         */}
      {/* ------------------------------------------------------------------ */}
      {hasContent && active && (
        <section aria-label="Exportar presupuesto" className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            <Download className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Exportar presupuesto
          </h2>
          {readiness && (
            <div className="mb-2">
              <ReadinessExportAlert status={readiness.status} message={readinessExportMessage(readiness.status)} />
            </div>
          )}
          <p className="mb-2 text-xs text-gray-500">
            Versión exportada:{' '}
            <span className="font-medium text-gray-700">{formatVersionLabel(active.versionNumber)}</span>
            {' · '}Datos al {formatDateTime(new Date().toISOString())}
          </p>
          <Suspense fallback={<ExportButtons projectId={id} scopeId={scopeId} estimateId={estimateId} counts={null} />}>
            <ExportButtonsStreamed viewer={viewer} projectId={id} scopeId={scopeId} estimateId={estimateId} />
          </Suspense>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Importar Excel (4C.1)                                               */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Importar Excel" className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <Upload className="h-4 w-4 text-gray-400" aria-hidden="true" />
          Importar Excel
        </h2>
        {hasContent ? (
          <div
            className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Importación completada.</strong> Esta versión ya contiene{' '}
              {active!.chapterCount} capítulos y {active!.itemCount} ítems. La reimportación
              estará disponible en una fase posterior.
            </span>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
            <p className="text-sm text-gray-600">
              V01 todavía no contiene capítulos ni ítems. Importa el Excel para cargar el BOQ.
            </p>
            <div className="mt-3">
              {canImport ? (
                <Button asChild size="sm">
                  <Link href={importHref}>
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    Importar Excel
                  </Link>
                </Button>
              ) : (
                <Button size="sm" disabled aria-disabled="true" title="Disponible en modo supabase+db">
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Importar Excel
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Conteos de export resueltos FUERA de la ruta crítica (Suspense streaming). El
 * cálculo (selección APU) hoy es N+1 y lento; aquí ya no bloquea el render de la
 * página. Degrada a `counts={null}` si falla (la exportación sigue disponible).
 * NO modifica el motor de export.
 */
async function ExportButtonsStreamed({
  viewer,
  projectId,
  scopeId,
  estimateId,
}: {
  viewer: Awaited<ReturnType<typeof resolveViewer>>;
  projectId: string;
  scopeId: string;
  estimateId: string;
}) {
  let counts: ExportCounts | null = null;
  try {
    counts = (await getBudgetApuExportSelection(viewer, estimateId)).counts;
  } catch {
    counts = null;
  }
  return <ExportButtons projectId={projectId} scopeId={scopeId} estimateId={estimateId} counts={counts} />;
}
