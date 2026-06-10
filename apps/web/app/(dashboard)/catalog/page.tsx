/**
 * Pagina de catalogo de recursos — Oleada 3A + Bootstrap CTAs.
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Consume el read-model canonico (@/server/read-model) en lugar de mocks estaticos.
 * NO importa @/lib/utils/mocks. NO expone campos (precios internos, SKU, etc.).
 * budgetReferencePrice es cliente-safe y se muestra solo si esta disponible.
 */
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCOP, RESOURCE_TYPE_LABELS } from '@/lib/utils/format';
import { getReadModel } from '@/server/read-model';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import type { CatalogResourceView } from '@/lib/contracts/read-model';

// Render request-time: viewer real por modo (db=autenticado, fixture=demo).
export const dynamic = 'force-dynamic';

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
  let resources: CatalogResourceView[] = [];
  let error: string | null = null;

  try {
    const viewer = await resolveViewer();
    resources = await rm.listCatalogResources(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar catalogo';
  }

  // Determinado server-side — el action lo verificara de nuevo con autenticacion real
  const canCreate = isCreationModeEnabled();

  if (error) {
    return (
      <div>
        <PageHeader title="Catalogo de Recursos" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
          aria-live="assertive"
        >
          Error al cargar catalogo: {error}
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
    {},
  );

  const headerActions = (
    <>
      {canCreate ? (
        <Button asChild size="sm">
          <Link href="/catalog/resources/new">Nuevo recurso</Link>
        </Button>
      ) : (
        <Button
          size="sm"
          disabled
          title="Disponible en modo supabase+db"
          aria-disabled="true"
        >
          Nuevo recurso
        </Button>
      )}
      <Button asChild size="sm" variant="outline">
        <Link href="/catalog/providers">Gestionar proveedores</Link>
      </Button>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Catalogo de Recursos"
        description="Materiales, mano de obra y equipos disponibles para APU y BOQ"
        actions={headerActions}
      />

      {resources.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Catalogo vacio"
          description="No hay recursos en el catalogo de la organizacion."
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/catalog/resources/new">Crear primer recurso</Link>
              </Button>
            ) : (
              <Button disabled aria-disabled="true" title="Disponible en modo supabase+db">
                Crear primer recurso
              </Button>
            )
          }
          secondaryAction={
            <Button variant="outline" asChild>
              <Link href="/catalog/providers">Gestionar proveedores</Link>
            </Button>
          }
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
                          Codigo
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
                          {/* Fila completa como enlace hacia price-intelligence */}
                          <td className="px-4 py-2.5">
                            <Link
                              href={`/catalog/resources/${resource.id}/price-intelligence`}
                              className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                              {resource.code}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">
                            <Link
                              href={`/catalog/resources/${resource.id}/price-intelligence`}
                              className="hover:text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                            >
                              {resource.name}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-600">
                            {resource.unit}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                            {resource.budgetReferencePrice ? (
                              formatCOP(resource.budgetReferencePrice)
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
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
          locationReference y ahorros son campos y NO se muestran aqui. */}
    </div>
  );
}
