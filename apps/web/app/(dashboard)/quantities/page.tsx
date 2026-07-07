/**
 * Página de cantidades y despieces geométricos.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * UIX V5.7A: shell/naming/narrativa solamente.
 * NO recalcula cantidades en frontend, NO toca sync, BOQ, APU ni importadores.
 */
import Link from 'next/link';
import { ArrowRightLeft, FileSpreadsheet, Hash } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { resolveViewer, resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { listQuantityImportBatches } from '@/server/quantity-import';
import { getFriendlyDataLoadError } from '@/lib/db/errors';
import type { ImportedBatchSummary } from '@/lib/quantity-import/types';
import type { ViewerContext } from '@/lib/contracts/read-model';
import { QuantitiesShell, type QuantitiesTab } from './_components/quantities-shell';
import { createOpsPerfTrace } from '@/server/performance/ops-perf';

export const dynamic = 'force-dynamic';

export default async function QuantitiesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const query = searchParams ? await searchParams : {};
  const rawTab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const activeTab: QuantitiesTab = rawTab === 'sync' ? 'sync' : 'imports';
  const perf = createOpsPerfTrace('/quantities', { tab: activeTab });

  const rm = getReadModel();

  let scopeId: string | null = null;
  let projectName = '';
  let scopeName = '';
  let loadError: string | null = null;

  let viewer: ViewerContext | null = null;
  let canImport = false;
  try {
    const resolvedViewer = await perf.span('auth.resolveViewer', async () => await resolveViewer());
    viewer = resolvedViewer;
    canImport = isCreationModeEnabled() && ['management', 'internal'].includes(resolvedViewer.role);
    const projects = await perf.span('readModel.listProjects', () => rm.listProjects(resolvedViewer));
    if (projects.length > 0) {
      const first = projects[0]!;
      projectName = first.name;
      const overview = await perf.span('readModel.getProjectOverview', () => rm.getProjectOverview(resolvedViewer, first.id));
      if (overview) {
        const floorScope = overview.scopes.find((s) => s.scopeType === 'floor');
        const anyScope = overview.scopes[0];
        const chosen = floorScope ?? anyScope;
        if (chosen) {
          scopeId = chosen.id;
          scopeName = chosen.name;
        }
      }
    }
  } catch (e) {
    loadError = getFriendlyDataLoadError(e, 'No pudimos cargar el proyecto de cantidades en este momento. Intenta actualizar en unos segundos.');
  }

  let groups: Awaited<ReturnType<typeof rm.listQuantities>> = [];

  if (viewer && scopeId && !loadError) {
    try {
      groups = await perf.span('readModel.listQuantities', () => rm.listQuantities(viewer, scopeId));
    } catch (e) {
      loadError = getFriendlyDataLoadError(e, 'No pudimos cargar las cantidades en este momento. Intenta actualizar en unos segundos.');
    }
  }

  let importedBatches: ImportedBatchSummary[] = [];
  if (canImport && !loadError) {
    try {
      const authedViewer = await perf.span('auth.resolveAuthenticatedViewer', () => resolveAuthenticatedViewer());
      importedBatches = await perf.span('quantityImport.listBatches', () => listQuantityImportBatches(authedViewer));
    } catch {
      // Lectura opcional: no bloquea la página.
    }
  }

  const actions = (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" asChild>
        <Link href="/quantities/workspace">Mediciones</Link>
      </Button>
      {canImport ? (
        <Button size="sm" asChild>
          <Link href="/quantities/import">
            <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />
            Importar memorias
          </Link>
        </Button>
      ) : null}
    </div>
  );

  perf.finish({ groupCount: groups.length, batchCount: importedBatches.length, hasError: Boolean(loadError) });

  if (loadError) {
    return (
      <QuantitiesShell activeTab={activeTab} actions={actions}>
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" aria-live="assertive">
          {loadError}
        </div>
      </QuantitiesShell>
    );
  }

  const hasQuantityGroups = groups.length > 0;
  const hasImportedMemories = importedBatches.length > 0;

  return (
    <QuantitiesShell
      activeTab={activeTab}
      stat={{ label: activeTab === 'sync' ? 'Pendientes' : 'Registros', value: String(activeTab === 'sync' ? 0 : groups.length + importedBatches.length) }}
      actions={actions}
    >
      {activeTab === 'sync' ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="Sin sincronizaciones pendientes"
          description="La sincronización de mediciones al presupuesto vive en cada grupo de Mediciones. Cuando haya líneas listas para enviar, verás un preview antes de modificar el presupuesto."
        />
      ) : !hasQuantityGroups && !hasImportedMemories ? (
        <EmptyState
          icon={Hash}
          title="Aún no hay cantidades de obra"
          description={
            canImport
              ? 'Importa memorias o crea mediciones para construir las cantidades reales que alimentan el presupuesto.'
              : 'No hay memorias ni mediciones visibles para tu rol. Cuando el equipo de presupuestos las cree o importe, aparecerán aquí.'
          }
          action={
            canImport ? (
              <Button size="sm" asChild>
                <Link href="/quantities/import">Importar memorias</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {hasQuantityGroups ? (
            <section className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-content">Cantidades por alcance</h2>
                <p className="text-sm text-content-muted">
                  {projectName && scopeName ? `${projectName} / ${scopeName}` : 'Grupos calculados desde el read-model de cantidades.'}
                </p>
              </div>
              {groups.map((group) => (
                <Card key={group.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="mb-1 flex items-center gap-2">
                          <Badge variant="outline">
                            {group.lines.length} línea{group.lines.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <CardTitle className="text-base">{group.name}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent>
                    {group.lines.length === 0 ? (
                      <p className="text-sm italic text-gray-400">Sin líneas de medición.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm" aria-label={`Despiece de ${group.name}`}>
                          <thead>
                            <tr className="border-b border-gray-200 text-xs text-gray-500">
                              <th className="pb-2 text-left font-medium">Descripción</th>
                              <th className="pb-2 text-right font-medium">Cantidad</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {group.lines.map((line) => (
                              <tr key={line.id} className="hover:bg-gray-50">
                                <td className="py-1.5 text-gray-700">{line.description ?? '—'}</td>
                                <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                                  {formatNumber(line.calculatedQuantity, 4)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </section>
          ) : (
            <EmptyState
              icon={Hash}
              title="Sin cantidades por alcance"
              description="Todavía no hay grupos calculados para el alcance seleccionado. Las memorias importadas pueden existir como trazabilidad separada."
            />
          )}
        </div>
      )}

      {activeTab === 'imports' && importedBatches.length > 0 ? (
        <div id="imported-batches" className="mt-8 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            Memorias importadas ({importedBatches.length} {importedBatches.length === 1 ? 'lote' : 'lotes'})
          </h2>
          {importedBatches.map((batch) => (
            <Card key={batch.batchId}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium">{batch.sourceFilename}</CardTitle>
                    <p className="text-xs text-gray-500">
                      {new Date(batch.importedAt).toLocaleDateString('es-CO')} &middot; {batch.groupsCount} grupos &middot; {batch.linesCount} líneas
                      {batch.linkedBoqItems > 0 ? ` · ${batch.linkedBoqItems} vinculados al presupuesto` : ''}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500">
                      <th className="pb-2 font-medium">Descripción</th>
                      <th className="pb-2 text-right font-medium">Líneas</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                      <th className="pb-2 font-medium">Unidad</th>
                      <th className="pb-2 font-medium">BOQ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.groups.map((g) => (
                      <tr key={g.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-3">{g.description}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{g.lineCount}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums font-medium">
                          {formatNumber(g.totalCalculated, 4)}{g.unit ? ` ${g.unit}` : ''}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-gray-500">{g.unit ?? '—'}</td>
                        <td className="py-1.5">
                          {g.boqItemId ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Vinculado</span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : activeTab === 'imports' && (hasQuantityGroups || hasImportedMemories) ? (
        <div id="imported-batches" className="mt-8">
          <EmptyState
            icon={FileSpreadsheet}
            title="Sin memorias importadas"
            description={
              canImport
                ? 'Aún no hay lotes de Excel visibles. Puedes importar memorias sin modificar el presupuesto.'
                : 'Tu rol no puede importar memorias. Cuando exista un lote importado, se mostrará aquí como trazabilidad.'
            }
            action={
              canImport ? (
                <Button size="sm" asChild>
                  <Link href="/quantities/import">Importar memorias</Link>
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}
    </QuantitiesShell>
  );
}
