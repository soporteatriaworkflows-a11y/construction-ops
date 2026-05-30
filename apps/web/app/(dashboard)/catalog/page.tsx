/**
 * Página de catálogo de recursos — mock Oleada 1.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Muestra recursos del catálogo maestro.
 * NO expone campos 🔒 (observedPrice, supplierSku, etc.).
 */
import { BookOpen, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatPct, RESOURCE_TYPE_LABELS } from '@/lib/utils/format';
import { MOCK_RESOURCES } from '@/lib/utils/mocks';
import type { ResourceType } from '@/lib/utils/types';

const RESOURCE_TYPE_VARIANT: Record<
  ResourceType,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  material: 'default',
  labor: 'success',
  equipment: 'warning',
  tool: 'secondary',
  subcontract: 'outline',
  other: 'outline',
};

export default function CatalogPage() {
  const resources = MOCK_RESOURCES;

  // Agrupamos por resourceType para mejor visualización
  const byType = resources.reduce<Record<string, typeof resources>>(
    (acc, resource) => {
      const key = resource.resourceType;
      if (!acc[key]) acc[key] = [];
      acc[key]!.push(resource);
      return acc;
    },
    {}
  );

  const orderedTypes: ResourceType[] = [
    'material',
    'labor',
    'equipment',
    'tool',
    'subcontract',
    'other',
  ];

  return (
    <div>
      <PageHeader
        title="Catálogo de Recursos"
        description="Materiales, mano de obra y equipos disponibles para APU y BOQ"
      />

      {resources.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Catálogo vacío"
          description="No hay recursos en el catálogo de la organización."
        />
      ) : (
        <div className="space-y-8">
          {orderedTypes.map((type) => {
            const group = byType[type];
            if (!group || group.length === 0) return null;

            return (
              <section key={type} aria-label={`Recursos de tipo ${RESOURCE_TYPE_LABELS[type]}`}>
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
                  <Badge variant={RESOURCE_TYPE_VARIANT[type]}>
                    {RESOURCE_TYPE_LABELS[type]}
                  </Badge>
                  <span className="text-gray-400 font-normal normal-case tracking-normal">
                    ({group.length})
                  </span>
                </h2>

                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <table
                    className="w-full text-sm"
                    aria-label={`Tabla de ${RESOURCE_TYPE_LABELS[type]}`}
                  >
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Código
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Nombre
                        </th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Unidad
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Desperdicio
                        </th>
                        <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.map((resource) => (
                        <tr
                          key={resource.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-xs text-gray-500">
                              {resource.code}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            {resource.name}
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-600">
                            {resource.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                            {formatPct(resource.defaultWastePct)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <Badge
                              variant={resource.active ? 'success' : 'outline'}
                            >
                              {resource.active ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Campos internos no mostrados — privacidad */}
      {/* observedPrice, supplierSku, productUrl, locationReference, negotiated_discount_pct
          NO se muestran en esta vista. Son campos 🔒 del contrato. */}

      {/* Aviso mock */}
      <div
        className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700"
        role="status"
      >
        Modo mock — Oleada 1. Precios del catálogo y datos de proveedores
        disponibles en Oleada 2 (pricing agent).
      </div>
    </div>
  );
}
