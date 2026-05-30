/**
 * Página de cantidades y despieces geométricos — mock Oleada 1.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Los calculatedQuantity ya vienen del mock (cost-domain los proveerá en Oleada 2).
 * NO recalcular en el frontend.
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
  CardDescription,
} from '@/components/ui/card';
import {
  formatNumber,
  CALCULATION_MODE_LABELS,
} from '@/lib/utils/format';
import {
  MOCK_QUANTITY_GROUPS,
  MOCK_QUANTITY_LINES,
  MOCK_SCOPES,
  MOCK_PROJECTS,
} from '@/lib/utils/mocks';

export default function QuantitiesPage() {
  const groups = MOCK_QUANTITY_GROUPS;

  return (
    <div>
      <PageHeader
        title="Cantidades y Despieces"
        description="Despieces geométricos vinculados a alcances del proyecto"
      />

      {groups.length === 0 ? (
        <EmptyState
          icon={Hash}
          title="Sin grupos de cantidades"
          description="No hay grupos de cantidades registrados."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((group) => {
            const scope = MOCK_SCOPES.find(
              (s) => s.id === group.projectScopeId
            );
            const project = scope
              ? MOCK_PROJECTS.find((p) => p.id === scope.projectId)
              : undefined;

            const lines = MOCK_QUANTITY_LINES.filter(
              (l) => l.quantityGroupId === group.id
            ).sort((a, b) => a.sortOrder - b.sortOrder);

            // Total ya calculado en el mock — NO operar aquí
            const total = lines.reduce((acc, l) => {
              // Este reduce es solo para mostrar el total sumado de líneas ya calculadas.
              // En producción, cost-domain proveerá este valor directamente.
              return acc + parseFloat(l.calculatedQuantity);
            }, 0);

            return (
              <Card key={group.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                          {group.code}
                        </span>
                        <Badge variant="secondary">
                          {CALCULATION_MODE_LABELS[group.calculationMode] ??
                            group.calculationMode}
                        </Badge>
                      </div>
                      <CardTitle className="text-base">{group.name}</CardTitle>
                      {scope && project && (
                        <CardDescription>
                          {project.name} › {scope.name}
                        </CardDescription>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Unidad</p>
                      <p className="font-semibold text-gray-900">{group.unit}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {lines.length === 0 ? (
                    <p className="text-sm italic text-gray-400">
                      Sin líneas de despiece.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table
                        className="w-full text-sm"
                        aria-label={`Despiece de ${group.name}`}
                      >
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-500">
                            <th className="pb-2 text-left font-medium">Descripción</th>
                            {group.calculationMode !== 'direct' && (
                              <>
                                <th className="pb-2 text-right font-medium">Largo</th>
                                {['area', 'volume'].includes(group.calculationMode) && (
                                  <th className="pb-2 text-right font-medium">Ancho</th>
                                )}
                                {group.calculationMode === 'volume' && (
                                  <th className="pb-2 text-right font-medium">Alto</th>
                                )}
                              </>
                            )}
                            <th className="pb-2 text-right font-medium">
                              Multiplicador
                            </th>
                            <th className="pb-2 text-right font-medium">
                              Cantidad ({group.unit})
                            </th>
                            <th className="pb-2 text-left font-medium">Notas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {lines.map((line) => (
                            <tr key={line.id} className="hover:bg-gray-50">
                              <td className="py-1.5 text-gray-700">
                                {line.description ?? '—'}
                              </td>
                              {group.calculationMode !== 'direct' && (
                                <>
                                  <td className="py-1.5 text-right tabular-nums text-gray-600">
                                    {line.length
                                      ? formatNumber(line.length, 4)
                                      : '—'}
                                  </td>
                                  {['area', 'volume'].includes(
                                    group.calculationMode
                                  ) && (
                                    <td className="py-1.5 text-right tabular-nums text-gray-600">
                                      {line.width
                                        ? formatNumber(line.width, 4)
                                        : '—'}
                                    </td>
                                  )}
                                  {group.calculationMode === 'volume' && (
                                    <td className="py-1.5 text-right tabular-nums text-gray-600">
                                      {line.height
                                        ? formatNumber(line.height, 4)
                                        : '—'}
                                    </td>
                                  )}
                                </>
                              )}
                              <td className="py-1.5 text-right tabular-nums text-gray-600">
                                {formatNumber(line.multiplier, 2)}
                              </td>
                              <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                                {formatNumber(line.calculatedQuantity, 4)}
                              </td>
                              <td className="py-1.5 text-xs italic text-gray-400">
                                {line.notes ?? ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gray-300">
                            <td
                              className="pt-2 text-sm font-semibold text-gray-700"
                              colSpan={
                                group.calculationMode === 'volume'
                                  ? 5
                                  : group.calculationMode === 'area'
                                  ? 4
                                  : group.calculationMode === 'direct'
                                  ? 2
                                  : 3
                              }
                            >
                              Total
                            </td>
                            <td className="pt-2 text-right tabular-nums font-bold text-blue-700">
                              {formatNumber(String(total), 4)} {group.unit}
                            </td>
                            <td />
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

      {/* Aviso mock */}
      <div
        className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700"
        role="status"
      >
        Modo mock — Oleada 1. Cantidades calculadas estáticas.
        En Oleada 2, cost-domain proveerá las cantidades calculadas dinámicamente.
      </div>
    </div>
  );
}
