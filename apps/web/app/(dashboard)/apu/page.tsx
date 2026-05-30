/**
 * Página de catálogo APU — mock Oleada 1.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Muestra plantillas APU y sus componentes.
 * NO calcula totales; los valores vienen de los mocks.
 */
import { Calculator } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCOP, formatNumber, formatPct, RESOURCE_TYPE_LABELS } from '@/lib/utils/format';
import {
  MOCK_APU_TEMPLATES,
  MOCK_APU_COMPONENTS,
  MOCK_RESOURCES,
  getComponentsByApu,
} from '@/lib/utils/mocks';

export default function ApuPage() {
  const templates = MOCK_APU_TEMPLATES;

  return (
    <div>
      <PageHeader
        title="Análisis de Precios Unitarios (APU)"
        description="Catálogo de plantillas APU reutilizables por proyecto"
      />

      {templates.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="Sin plantillas APU"
          description="No hay plantillas APU en el catálogo."
        />
      ) : (
        <div className="space-y-6">
          {templates.map((template) => {
            const components = getComponentsByApu(MOCK_APU_COMPONENTS, template.id);

            return (
              <Card key={template.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                          {template.code}
                        </span>
                        <Badge variant="secondary">v{template.version}</Badge>
                        <Badge variant={template.active ? 'success' : 'outline'}>
                          {template.active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      {template.description && (
                        <CardDescription className="mt-0.5">
                          {template.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Unidad base</p>
                      <p className="font-semibold text-gray-900">{template.unit}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {components.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      Sin componentes registrados.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table
                        className="w-full text-sm"
                        aria-label={`Componentes del APU ${template.code}`}
                      >
                        <thead>
                          <tr className="border-b border-gray-200 text-xs text-gray-500">
                            <th className="pb-2 text-left font-medium">Tipo</th>
                            <th className="pb-2 text-left font-medium">Recurso</th>
                            <th className="pb-2 text-right font-medium">Cantidad</th>
                            <th className="pb-2 text-right font-medium">Desperdicio</th>
                            <th className="pb-2 text-right font-medium">P. Unitario</th>
                            <th className="pb-2 text-right font-medium">Total componente</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {components
                            .sort((a, b) => a.sortOrder - b.sortOrder)
                            .map((comp) => {
                              const resource = comp.resourceId
                                ? MOCK_RESOURCES.find((r) => r.id === comp.resourceId)
                                : null;
                              return (
                                <tr key={comp.id} className="hover:bg-gray-50">
                                  <td className="py-1.5">
                                    <Badge variant="secondary" className="text-xs">
                                      {RESOURCE_TYPE_LABELS[comp.componentType] ??
                                        comp.componentType}
                                    </Badge>
                                  </td>
                                  <td className="py-1.5 text-gray-700">
                                    {resource?.name ?? (
                                      <span className="italic text-gray-400">
                                        {comp.unitPriceSource === 'manual'
                                          ? 'Manual'
                                          : 'Sin recurso'}
                                      </span>
                                    )}
                                    {resource && (
                                      <span className="ml-1.5 text-xs text-gray-400">
                                        ({resource.unit})
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-gray-700">
                                    {formatNumber(comp.quantity, 4)}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-gray-500">
                                    {formatPct(comp.wastePct)}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums text-gray-700">
                                    {formatCOP(comp.unitPriceSnapshot)}
                                  </td>
                                  <td className="py-1.5 text-right tabular-nums font-medium text-gray-900">
                                    {formatCOP(comp.totalComponentCost)}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
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
        Modo mock — Oleada 1. APU estático. Oleada 2 conectará cálculos
        de mano de obra y costos unitarios reales.
      </div>
    </div>
  );
}
