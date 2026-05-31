/**
 * Página de catálogo de recursos — Oleada 3A.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model canónico (@/server/read-model) en lugar de mocks estáticos.
 * NO importa @/lib/utils/mocks. NO expone campos 🔒 (precios internos, SKU, etc.).
 * budgetReferencePrice es cliente-safe y se muestra solo si está disponible.
 */
import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { formatCOP, RESOURCE_TYPE_LABELS } from '@/lib/utils/format';
import { getReadModel, getDemoViewer } from '@/server/read-model';
import type { CatalogResourceView } from '@/lib/contracts/read-model';

const RESOURCE_TYPE_ORDER = [
  'material',
  'labor',
  'equipment',
  'tool',
  'subcontract',
  'other',
] as const;

const RESOURCE_TYPE_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  material: 'default',
  labor: 'success',
  equipment: 'warning',
  tool: 'secondary',
  subcontract: 'outline',
  other: 'outline',
};

export default async function CatalogPage() {
  const rm = getReadModel();
  const viewer = getDemoViewer();
  let resources: CatalogResourceView[] = [];
  let error: string | null = null;

  try {
    resources = await rm.listCatalogResources(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar catálogo';
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Catálogo de Recursos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error al cargar catálogo: {error}
        </div>
      </div>
    );
  }

  // Agrupar por resourceType
  const byType = resources.reduce<Record<string, CatalogResourceView[]>>(
    (acc, r) => {
      if (!acc[r.resourceType]) acc[r.resourceType] = [];
      acc[r.resourceType]!.push(r);
      return acc;
    },
    {}
  );

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
          {RESOURCE_TYPE_ORDER.map((type) => {
            const group = byType[type];
            if (!group || group.length === 0) return null;

            return (
              <section
                key={type}
                aria-label={`Recursos de tipo ${RESOURCE_TYPE_LABELS[type] ?? type}`}
              >
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
                  <Badge variant={RESOURCE_TYPE_VARIANT[type] ?? 'outline'}>
                    {RESOURCE_TYPE_LABELS[type] ?? type}
                  </Badge>
                  <span className="text-gray-400 font-normal normal-case tracking-normal">
                    ({group.length})
                  </span>
                </h2>

                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <table
                    className="w-full text-sm"
                    aria-label={`Tabla de ${RESOURCE_TYPE_LABELS[type] ?? type}`}
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
                        {/* budgetReferencePrice es cliente-safe — se muestra si disponible */}
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                          P. Referencia
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
                            {resource.budgetReferencePrice
                              ? formatCOP(resource.budgetReferencePrice)
                              : <span className="text-gray-300 text-xs">—</span>}
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

      {/* Nota de privacidad — campos internos no mostrados */}
      {/* negotiated_discount_pct, observedPrice, supplierSku, productUrl,
          locationReference y ahorros son campos 🔒 y NO se muestran aquí. */}
    </div>
  );
}
