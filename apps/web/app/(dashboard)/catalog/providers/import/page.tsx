/**
 * Página de importación de lista de precios de proveedor —
 * /catalog/providers/import (CATALOG_BULK_ONBOARDING_V1). Server Component.
 * Propiedad: agent-frontend-boq / agent-pricing.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { DbCatalogImportRepository } from '@/server/catalog/import';
import { PriceListWizard } from './_components/price-list-wizard';

export const dynamic = 'force-dynamic';

export default async function ProviderPriceListImportPage() {
  const authMode = resolveAuthMode();
  let viewerRole = 'consulta';
  let providers: Array<{ id: string; name: string }> = [];
  let loadError: string | null = null;

  const breadcrumb = (
    <Link
      href="/catalog/providers"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Proveedores
    </Link>
  );

  let canImport = false;
  if (isCreationModeEnabled()) {
    try {
      const viewer = await resolveAuthenticatedViewer();
      viewerRole = viewer.role;
      canImport = ['management', 'internal'].includes(viewerRole);
      if (canImport) {
        providers = await new DbCatalogImportRepository().listActiveProviders(viewer);
      }
    } catch {
      loadError = 'No se pudieron cargar los proveedores.';
    }
  }

  if (!canImport) {
    const isDemoMode = authMode === 'demo';
    return (
      <div>
        <PageHeader title="Importar lista de precios" breadcrumb={breadcrumb} />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
        >
          {isDemoMode ? (
            <>
              <strong>Modo demostración activo.</strong> La importación de listas de
              precios no está disponible. Requiere{' '}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">
                APP_AUTH_MODE=supabase
              </code>{' '}
              con datos reales.
            </>
          ) : (
            <>
              <strong>Sin permisos de importación.</strong> Solicita acceso a un
              administrador para importar listas de precios.
            </>
          )}
        </div>
        <div className="mt-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/catalog/providers">Volver a proveedores</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Importar lista de precios"
        description="Carga la lista de un proveedor desde Excel o CSV. Cada precio crea una observación pendiente de aprobación; las filas sin asociar quedan para revisión humana."
        breadcrumb={breadcrumb}
      />
      {loadError ? (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {loadError}
        </div>
      ) : providers.length === 0 ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
        >
          No hay proveedores activos. Crea primero el proveedor en{' '}
          <Link href="/catalog/providers/new" className="font-medium underline">
            Nuevo proveedor
          </Link>
          .
        </div>
      ) : (
        <PriceListWizard providers={providers} />
      )}
    </div>
  );
}
