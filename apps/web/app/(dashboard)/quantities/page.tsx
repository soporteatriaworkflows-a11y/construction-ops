/**
 * Página de cantidades y despieces geométricos — Oleada 3A.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model canónico (@/server/read-model) en lugar de mocks estáticos.
 * NO importa @/lib/utils/mocks. NO recalcula cantidades en el frontend.
 * calculatedQuantity llega pre-calculado desde el read-model.
 */
import { Hash } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatNumber, CALCULATION_MODE_LABELS } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
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
  try {
    viewer = await resolveViewer();
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

  return (
    <div>
      <PageHeader
        title="Cantidades y Despieces"
        description={
          projectName && scopeName
            ? `${projectName} / ${scopeName}`
            : 'Despieces geométricos vinculados a alcances del proyecto'
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="Sin grupos de cantidades"
          description="Las cantidades se registran al importar o crear un presupuesto vinculado a un alcance del proyecto."
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
    </div>
  );
}
