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
import { resolveAuthMode } from '@/lib/supabase/env';
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

const PRICE_STATUS_LABELS: Record<'approved' | 'pending' | 'rejected' | 'none', string> = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  none: 'Sin precio',
};

const PRICE_STATUS_VARIANT: Record<
  'approved' | 'pending' | 'rejected' | 'none',
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
> = {
  approved: 'success',
  pending: 'warning',
  rejected: 'destructive',
  none: 'outline',
};

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
  let viewerRole: string = 'consulta';
  let error: string | null = null;

  try {
    const viewer = await resolveViewer();
    viewerRole = viewer.role;
    resources = await rm.listCatalogResources(viewer);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar catalogo';
  }

  const authMode = resolveAuthMode();
  const CREATE_ROLES = ['management', 'internal'] as const;
  const canCreate =
    isCreationModeEnabled() && (CREATE_ROLES as readonly string[]).includes(viewerRole);
  const isDemoMode = authMode === 'demo';

  const disabledNotice = !canCreate
    ? isDemoMode
      ? 'Modo demostración: puedes explorar el catálogo. Para crear recursos, inicia sesión con datos reales.'
      : 'No tienes permisos para crear registros. Solicita acceso a un administrador.'
    : null;

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
    {},
  );

  // CTA primario: importación masiva (flujo principal). La ruta /catalog/import
  // siempre es navegable: explica el modo demo/read-only sin botones rotos.
  const headerActions = (
    <>
      <Button asChild size="sm">
        <Link href="/catalog/import">Importar catálogo</Link>
      </Button>
      {canCreate ? (
        <Button asChild size="sm" variant="outline">
          <Link href="/catalog/resources/new">Nuevo recurso</Link>
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled
          title={
            isDemoMode
              ? 'Disponible con datos reales — inicia sesión para crear recursos'
              : 'Sin permisos de creación — solicita acceso a un administrador'
          }
          aria-disabled="true"
        >
          Nuevo recurso
        </Button>
      )}
      <Button asChild size="sm" variant="outline">
        <Link href="/catalog/providers">Gestionar proveedores</Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link href="/catalog/prices/review">Revisión de precios</Link>
      </Button>
    </>
  );

  const emptyStateAction = (
    <div className="flex flex-col items-center gap-1.5">
      <Button asChild>
        <Link href="/catalog/import">Importar catálogo</Link>
      </Button>
      {disabledNotice && (
        <p className="text-xs text-amber-700" role="note">
          {disabledNotice}
        </p>
      )}
    </div>
  );

  const emptyStateSecondary = canCreate ? (
    <Button variant="outline" asChild>
      <Link href="/catalog/resources/new">Crear recurso manualmente</Link>
    </Button>
  ) : (
    <Button
      variant="outline"
      disabled
      aria-disabled="true"
      title={
        isDemoMode
          ? 'Disponible con datos reales — inicia sesión para crear recursos'
          : 'Sin permisos de creación — solicita acceso a un administrador'
      }
    >
      Crear recurso manualmente
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Catálogo de Recursos"
        description="Materiales, mano de obra y equipos disponibles para APU y BOQ"
        actions={headerActions}
      />

      {disabledNotice && (
        <div
          className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
          role="note"
          aria-label={isDemoMode ? 'Modo demostración activo' : 'Acceso de solo lectura'}
        >
          {disabledNotice}
        </div>
      )}

      {resources.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Catálogo vacío"
          description="Carga recursos desde Excel o CSV. La creación manual queda disponible para casos puntuales."
          action={emptyStateAction}
          secondaryAction={emptyStateSecondary}
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
                        <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Estado
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Precio
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Proveedor / fecha
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Precios
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.map((resource) => {
                        const status = resource.priceStatus ?? 'none';
                        return (
                          <tr
                            key={resource.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            {/* Código enlazado a Price Intelligence */}
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
                            <td className="px-4 py-2.5 text-center">
                              <Badge variant={PRICE_STATUS_VARIANT[status]}>
                                {PRICE_STATUS_LABELS[status]}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {status === 'approved' && resource.approvedPrice ? (
                                <span className="font-medium text-gray-900">
                                  {formatCOP(resource.approvedPrice)}
                                </span>
                              ) : status === 'pending' && resource.pendingPrice ? (
                                <span
                                  className="text-amber-700"
                                  title="Precio pendiente de aprobación"
                                >
                                  {formatCOP(resource.pendingPrice)}
                                  <span className="ml-1 text-[10px] uppercase">pend.</span>
                                </span>
                              ) : (
                                <span className="text-gray-300 text-xs">Sin precio aprobado</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {resource.supplierName ? (
                                <span>{resource.supplierName}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                              {resource.priceDate && (
                                <span className="ml-1 text-gray-400">
                                  · {resource.priceDate.slice(0, 10)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <Link
                                href={`/catalog/resources/${resource.id}/price-intelligence`}
                                className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {status === 'none'
                                  ? 'Agregar precio'
                                  : status === 'pending'
                                    ? 'Revisar precios'
                                    : 'Ver observaciones'}
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
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

      {/* Deuda: CATALOG_BULK_ONBOARDING_V1 — importación masiva de recursos diferida */}
    </div>
  );
}
