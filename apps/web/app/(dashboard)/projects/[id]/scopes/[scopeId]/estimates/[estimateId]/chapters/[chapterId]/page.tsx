/**
 * Detalle de capítulo + ítems BOQ — .../estimates/[estimateId]/chapters/[chapterId] (4D.1).
 *
 * Propiedad: agent-frontend-boq. Server Component, request-time. Cross-org /
 * inexistente ⇒ `notFound()` (RLS). Verifica que el capítulo pertenezca al
 * presupuesto/alcance/proyecto de la ruta. Trazabilidad (source_code/source_row)
 * de forma secundaria. NO calcula finanzas en React (subtotales persistidos/derivados).
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ListTree, Hash, DollarSign, FolderOpen, Layers, ClipboardList, Plus, Pencil, CheckCircle2, Archive } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { formatCOP, formatNumber } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository, ChapterNotFoundError } from '@/server/estimates';
import type { BoqItemReviewView } from '@/lib/estimates/review-types';
import { isCreationModeEnabled } from '../../../../../../../mode-guard';
import { canArchiveBudgetItems, canEditBudgetSurface } from '@/server/access/budget-surface';
import { ArchiveControls } from '../../archive-controls';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string; chapterId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ChapterDetailPage({ params, searchParams }: PageProps) {
  const { id, scopeId, estimateId, chapterId } = await params;
  const sp = searchParams ? await searchParams : {};
  const justSaved = sp['saved'] === '1';
  const showArchived = sp['archived'] === '1';
  const estimateHref = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}`;
  const chapterBase = `${estimateHref}/chapters/${chapterId}`;
  const itemNewHref = `${chapterBase}/items/new`;
  const itemEditHref = (itemId: string) => `${chapterBase}/items/${itemId}/edit`;
  const chapterEditHref = `${chapterBase}/edit`;
  const archiveToggleHref = `${chapterBase}${showArchived ? '' : '?archived=1'}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  // V5.6.6B: gate de modo + gate de ROL (compras/obra/consulta solo lectura).
  const canEdit = isCreationModeEnabled() && canEditBudgetSurface(viewer.profileRole);

  const repo = getEstimatesWriteRepository();
  let chapter: Awaited<ReturnType<typeof repo.getChapterById>>;
  try {
    chapter = await repo.getChapterById(viewer, chapterId);
  } catch (e) {
    if (e instanceof ChapterNotFoundError) notFound();
    notFound();
  }

  // Defensa: el capítulo debe pertenecer al presupuesto/proyecto de la ruta.
  if (chapter.estimateId !== estimateId || chapter.projectId !== id) {
    notFound();
  }

  // Versión activa editable ⇒ habilita acciones de archive/restore.
  let versionEditable = false;
  try {
    const av = await repo.getEstimateActiveVersion(viewer, estimateId);
    versionEditable = !!av && !['approved', 'issued', 'archived'].includes(av.status);
  } catch {
    versionEditable = false;
  }
  const canArchive =
    isCreationModeEnabled() && canArchiveBudgetItems(viewer.profileRole) && versionEditable;

  let items: BoqItemReviewView[] = [];
  let itemsError: string | null = null;
  try {
    items = await repo.listItemsByChapter(viewer, chapterId, { includeArchived: showArchived });
  } catch (e) {
    itemsError = e instanceof Error ? e.message : 'Error al cargar ítems';
  }

  const normalized = !!chapter.sourceCode && chapter.sourceCode !== chapter.code;

  return (
    <div>
      <PageHeader
        title={`${chapter.code} · ${chapter.name}`}
        breadcrumb={
          <Link
            href={estimateHref}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al presupuesto
          </Link>
        }
      />

      {justSaved && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status" aria-live="polite">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          Cambios guardados. Los subtotales y el total general reflejan los datos actuales.
        </div>
      )}

      {chapter.archived && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700" role="status">
          <Archive className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <span>Capítulo <strong>archivado</strong>: excluido de la vista activa y de los cálculos.</span>
          {canArchive && (
            <ArchiveControls kind="chapter" estimateId={estimateId} targetId={chapter.id} archived canWrite={canArchive} />
          )}
        </div>
      )}

      {canEdit && !chapter.archived && (
        <div className="mb-4 flex items-center gap-3">
          <Button asChild size="sm" variant="outline">
            <Link href={chapterEditHref}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar capítulo
            </Link>
          </Button>
          {canArchive && (
            <ArchiveControls kind="chapter" estimateId={estimateId} targetId={chapter.id} archived={false} canWrite={canArchive} />
          )}
        </div>
      )}

      {/* Resumen del capítulo + contexto */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">{chapter.code}</span>
              {normalized && (
                <Badge variant="warning" title={`Código original: ${chapter.sourceCode}${chapter.sourceRow ? ` (fila ${chapter.sourceRow})` : ''}`}>
                  Código normalizado
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-gray-900">{chapter.name}</p>
            {normalized && (
              <p className="text-xs text-gray-400">
                Origen: código <span className="font-mono">{chapter.sourceCode}</span>
                {chapter.sourceRow ? ` · fila ${chapter.sourceRow}` : ''}
              </p>
            )}
            <div className="flex flex-wrap gap-4 pt-1 text-sm text-gray-600">
              <span className="flex items-center gap-1.5">
                <Hash className="h-4 w-4 text-gray-400" aria-hidden="true" />
                {chapter.itemCount} ítem{chapter.itemCount === 1 ? '' : 's'}
              </span>
              <span className="flex items-center gap-1.5">
                <DollarSign className="h-4 w-4 text-gray-400" aria-hidden="true" />
                <span className="font-semibold text-blue-700 tabular-nums">{formatCOP(chapter.subtotal)}</span>
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 py-4 text-sm text-gray-700">
            <div className="flex items-start gap-2">
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <Link href={`/projects/${id}`} className="text-blue-700 hover:underline">{chapter.projectName ?? 'Proyecto'}</Link>
            </div>
            <div className="flex items-start gap-2">
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <Link href={`/projects/${id}/scopes/${scopeId}`} className="text-blue-700 hover:underline">{chapter.scopeName ?? 'Alcance'}</Link>
            </div>
            <div className="flex items-start gap-2">
              <ClipboardList className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
              <Link href={estimateHref} className="text-blue-700 hover:underline">
                {chapter.estimateName} · V{String(chapter.versionNumber).padStart(2, '0')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ítems BOQ */}
      <section aria-label="Ítems BOQ" className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            <ListTree className="h-4 w-4 text-gray-400" aria-hidden="true" />
            Ítems BOQ
          </h2>
          <div className="flex items-center gap-3">
            <Link href={archiveToggleHref} className="text-xs font-medium text-gray-500 hover:underline">
              {showArchived ? 'Ocultar archivados' : 'Mostrar archivados'}
            </Link>
            {canEdit && !chapter.archived ? (
              <Button asChild size="sm" variant="outline">
                <Link href={itemNewHref}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuevo ítem
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled aria-disabled="true" title={chapter.archived ? 'Capítulo archivado' : 'Disponible en modo supabase+db'}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo ítem
              </Button>
            )}
          </div>
        </div>
        {itemsError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            Error al cargar ítems: {itemsError}
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={ListTree} title="Sin ítems" description="Este capítulo no tiene ítems registrados." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-sm" aria-label="Tabla de ítems BOQ">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                  <th className="px-3 py-2 font-medium">Unidad</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 text-right font-medium">V/Unitario</th>
                  <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                  {canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it) => (
                  <tr key={it.id} className={`hover:bg-gray-50 ${it.archived ? 'bg-gray-50/60 text-gray-400' : ''}`}>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-gray-600">{it.code}</span>
                      {it.archived && (
                        <span className="ml-1.5 rounded bg-gray-200 px-1 py-0.5 text-[10px] font-medium text-gray-600">
                          Archivado
                        </span>
                      )}
                      {!it.archived && it.sourceCode && it.sourceCode !== it.code && (
                        <span
                          className="ml-1.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700"
                          title={`Código original: ${it.sourceCode}${it.sourceRow ? ` (fila ${it.sourceRow})` : ''}`}
                        >
                          norm.
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-900">{it.description}</td>
                    <td className="px-3 py-2 text-gray-600">{it.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatNumber(it.quantity)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{formatCOP(it.unitPrice)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatCOP(it.subtotal)}</td>
                    {canEdit && (
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-3">
                          {canArchive && (
                            <ArchiveControls kind="item" estimateId={estimateId} targetId={it.id} archived={it.archived} canWrite={canArchive} />
                          )}
                          {!it.archived && (
                            <Link href={itemEditHref(it.id)} className="inline-flex items-center gap-0.5 text-xs font-medium text-gray-600 hover:underline">
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              Editar
                            </Link>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
