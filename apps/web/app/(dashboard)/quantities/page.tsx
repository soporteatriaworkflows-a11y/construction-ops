/**
 * Página de cantidades y despieces geométricos — Oleada 3A.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model canónico (@/server/read-model) en lugar de mocks estáticos.
 * NO importa @/lib/utils/mocks. NO recalcula cantidades en el frontend.
 * calculatedQuantity llega pre-calculado desde el read-model.
 *
 * QUANTITY_IMPORT_PERSISTENCE_HOTFIX_V1:
 * Añade sección "Memorias importadas" leyendo quantity_import_batches +
 * quantity_takeoff_groups vía listQuantityImportBatches (RLS-bound, solo db).
 */
import Link from 'next/link';
import { FileSpreadsheet, Hash } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { OperationsHeader } from '@/components/shared/operations-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatNumber } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { resolveViewer, resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { listQuantityImportBatches } from '@/server/quantity-import';
import type { ImportedBatchSummary } from '@/lib/quantity-import/types';
import type { ViewerContext } from '@/lib/contracts/read-model';

// Render request-time: viewer real por modo (db=autenticado, fixture=demo).
export const dynamic = 'force-dynamic';

export default async function QuantitiesPage() {
  const rm = getReadModel();

  // Para cantidades necesitamos el scopeId del primer proyecto
  let scopeId: string | null = null;
  let projectName = '';
  let scopeName = '';
  let loadError: string | null = null;

  let viewer: ViewerContext | null = null;
  let canImport = false;
  try {
    viewer = await resolveViewer();
    canImport =
      isCreationModeEnabled() && ['management', 'internal'].includes(viewer.role);
    const projects = await rm.listProjects(viewer);
    if (projects.length > 0) {
      const first = projects[0]!;
      projectName = first.name;
      const overview = await rm.getProjectOverview(viewer, first.id);
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
    loadError = e instanceof Error ? e.message : 'Error al cargar proyecto';
  }

  let groups: Awaited<ReturnType<typeof rm.listQuantities>> = [];

  if (viewer && scopeId && !loadError) {
    try {
      groups = await rm.listQuantities(viewer, scopeId);
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Error al cargar cantidades';
    }
  }

  // Lotes de memorias importadas (solo modo db, roles con permiso de importación).
  // Usa resolveAuthenticatedViewer para obtener el AuthenticatedViewer completo.
  let importedBatches: ImportedBatchSummary[] = [];
  if (canImport && !loadError) {
    try {
      const authedViewer = await resolveAuthenticatedViewer();
      importedBatches = await listQuantityImportBatches(authedViewer);
    } catch {
      // Lectura opcional — no bloquea la página
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="Cantidades y Despieces" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error: {loadError}
        </div>
      </div>
    );
  }

  const importCta = (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" asChild>
        <Link href="/quantities/workspace">Workspace de cantidades</Link>
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

  return (
    <div>
      <OperationsHeader
        eyebrow="Cantidades"
        title="Revisión y sincronización"
        subtitle={
          projectName && scopeName
            ? `${projectName} / ${scopeName}`
            : 'Despieces geométricos vinculados a alcances del proyecto'
        }
        stat={{ label: 'Grupos', value: String(groups.length) }}
        actions={importCta}
      />

      {groups.length > 0 && (
        <InlineCallout tone="tip" title="Flujo de cantidades" className="mb-4">
          <strong>Importa</strong> las memorias → <strong>revisa</strong> los despieces →
          <strong> sincroniza</strong> al BOQ del presupuesto. Cada grupo muestra su total ya calculado;
          sincroniza los pendientes para que el presupuesto refleje las cantidades.
        </InlineCallout>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="Sin grupos de cantidades"
          description="Las cantidades se registran al importar las memorias del workbook o al crear un presupuesto vinculado a un alcance del proyecto."
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
          {groups.map((group) => {
            // Total ya calculado en el read-model — NO operar aquí (solo suma display)
            const displayTotal = group.lines.reduce(
              (acc, l) => acc + parseFloat(l.calculatedQuantity),
              0
            );

            return (
              <Card key={group.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
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
                    <p className="text-sm italic text-gray-400">Sin líneas de despiece.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table
                        className="w-full text-sm"
                        aria-label={`Despiece de ${group.name}`}
                      >
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-500">
                            <th className="pb-2 text-left font-medium">Descripción</th>
                            <th className="pb-2 text-right font-medium">
                              Cantidad
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {group.lines.map((line) => (
                            <tr key={line.id} className="hover:bg-gray-50">
                              <td className="py-1.5 text-gray-700">
                                {line.description ?? '—'}
                              </td>
                              <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                                {formatNumber(line.calculatedQuantity, 4)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300">
                            <td className="pt-2 text-sm font-semibold text-gray-700">
                              Total
                            </td>
                            <td className="pt-2 text-right tabular-nums font-bold text-blue-700">
                              {formatNumber(String(displayTotal), 4)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {importedBatches.length > 0 ? (
        <div id="imported-batches" className="mt-8 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            Memorias importadas ({importedBatches.length}{' '}
            {importedBatches.length === 1 ? 'lote' : 'lotes'})
          </h2>
          {importedBatches.map((batch) => (
            <Card key={batch.batchId}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-sm font-medium">
                      {batch.sourceFilename}
                    </CardTitle>
                    <p className="text-xs text-gray-500">
                      {new Date(batch.importedAt).toLocaleDateString('es-CO')} &middot;{' '}
                      {batch.groupsCount} grupos &middot; {batch.linesCount} líneas
                      {batch.linkedBoqItems > 0
                        ? ` · ${batch.linkedBoqItems} vinculados al presupuesto`
                        : ''}
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
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {g.lineCount}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums font-medium">
                          {formatNumber(g.totalCalculated, 4)}
                          {g.unit ? ` ${g.unit}` : ''}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-gray-500">
                          {g.unit ?? '—'}
                        </td>
                        <td className="py-1.5">
                          {g.boqItemId ? (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                              Vinculado
                            </span>
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
      ) : null}
    </div>
  );
}
