/**
 * Pagina de lista de proveedores — /catalog/providers (Fase 3A + Bootstrap CTAs).
 * Server Component. Propiedad: agent-frontend-boq.
 * Campos (defaultDiscountPercent, notes) solo visibles a admin/gerencia/compras.
 */
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { getProviderRepository } from '@/server/pricing';
import type { ProviderView } from '@/server/pricing';

export const dynamic = 'force-dynamic';

const SUPPLIER_TYPE_LABELS: Record<string, string> = {
  vendor: 'Proveedor',
  distributor: 'Distribuidor',
  manufacturer: 'Fabricante',
  subcontractor: 'Subcontratista',
  other: 'Otro',
};

// ViewerRole values: internal=admin/presupuestos/compras, management=gerencia
const INTERNAL_ROLES = ['internal', 'management'];
const ADMIN_ROLES = ['internal', 'management'];

export default async function ProvidersPage() {
  let providers: ProviderView[] = [];
  let viewerRole = 'consulta';
  let canCreate = false;
  let error: string | null = null;
  let mode = resolveAuthMode();

  try {
    if (mode === 'demo') {
      const viewer = await resolveViewer('demo');
      viewerRole = viewer.role;
      // In demo mode we need an AuthenticatedViewer shape for the repo
      const repo = getProviderRepository();
      providers = await repo.listProviders({
        userId: viewer.organizationId,
        profileId: viewer.organizationId,
        organizationId: viewer.organizationId,
        role: viewer.role,
      });
    } else {
      const authed = await resolveAuthenticatedViewer();
      viewerRole = authed.role;
      canCreate = ADMIN_ROLES.includes(authed.role);
      const repo = getProviderRepository();
      providers = await repo.listProviders(authed);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar proveedores';
  }

  const showInternalFields = INTERNAL_ROLES.includes(viewerRole);
  const isDemoMode = mode === 'demo';
  const disabledNotice = !canCreate
    ? isDemoMode
      ? 'Modo demostración: puedes explorar proveedores. Para registrar uno nuevo, inicia sesión con datos reales.'
      : 'No tienes permisos para crear registros. Solicita acceso a un administrador.'
    : null;

  if (error) {
    return (
      <div>
        <PageHeader title="Proveedores" />
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          Error al cargar proveedores: {error}
        </div>
      </div>
    );
  }

  const headerActions = canCreate ? (
    <Button asChild size="sm">
      <Link href="/catalog/providers/new">Nuevo proveedor</Link>
    </Button>
  ) : (
    <Button
      size="sm"
      disabled
      title={
        isDemoMode
          ? 'Disponible con datos reales — inicia sesión para registrar proveedores'
          : 'Sin permisos de creación — solicita acceso a un administrador'
      }
      aria-disabled="true"
    >
      Nuevo proveedor
    </Button>
  );

  return (
    <div>
      <PageHeader
        title="Proveedores"
        description="Proveedores registrados para inteligencia de precios"
        actions={headerActions}
        breadcrumb={
          <Link
            href="/catalog"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Catalogo
          </Link>
        }
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

      {providers.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin proveedores"
          description="No hay proveedores registrados para esta organizacion."
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/catalog/providers/new">Crear primer proveedor</Link>
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Button
                  disabled
                  aria-disabled="true"
                  title={
                    isDemoMode
                      ? 'Disponible con datos reales — inicia sesión para registrar proveedores'
                      : 'Sin permisos de creación — solicita acceso a un administrador'
                  }
                >
                  Crear primer proveedor
                </Button>
                {disabledNotice && (
                  <p className="text-xs text-amber-700" role="note">
                    {disabledNotice}
                  </p>
                )}
              </div>
            )
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm" aria-label="Lista de proveedores">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Nombre
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Tipo
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Sitio web
                </th>
                {showInternalFields && (
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Descuento (%)
                  </th>
                )}
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Estado
                </th>
                {canCreate && (
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Acciones
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {providers.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {p.name}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {SUPPLIER_TYPE_LABELS[p.supplierType] ?? p.supplierType}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {p.websiteUrl ? (
                      <span className="truncate max-w-[200px] block text-xs text-blue-600">
                        {p.websiteUrl}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  {showInternalFields && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                      {Number(p.defaultDiscountPercent).toFixed(2)}%
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-center">
                    <Badge variant={p.active ? 'success' : 'outline'}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  {canCreate && (
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/catalog/providers/${p.id}/edit`}>
                        <Button size="sm" variant="outline">
                          Editar
                        </Button>
                      </Link>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
