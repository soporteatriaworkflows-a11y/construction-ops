/**
 * Página de importación masiva de catálogo — /catalog/import
 * (CATALOG_BULK_ONBOARDING_V1). Server Component. Propiedad: agent-frontend-boq.
 *
 * Flujo principal de incorporación de catálogo: la creación individual queda
 * como excepción. En modo demo/read-only se explica por qué no está disponible
 * (sin botones rotos).
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { CatalogImportWizard } from './_components/catalog-import-wizard';

export const dynamic = 'force-dynamic';

export default async function CatalogImportPage() {
  const authMode = resolveAuthMode();
  let viewerRole = 'consulta';
  try {
    const viewer = await resolveViewer();
    viewerRole = viewer.role;
  } catch {
    // Sin sesión válida — el Proxy ya redirige. Defensa en profundidad.
  }

  const canImport =
    isCreationModeEnabled() && ['management', 'internal'].includes(viewerRole);
  const isDemoMode = authMode === 'demo';

  const breadcrumb = (
    <Link
      href="/catalog"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Catálogo
    </Link>
  );

  if (!canImport) {
    return (
      <div>
        <PageHeader title="Importar catálogo" breadcrumb={breadcrumb} />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
        >
          {isDemoMode ? (
            <>
              <strong>Modo demostración activo.</strong> La importación masiva no está
              disponible. Requiere{' '}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">
                APP_AUTH_MODE=supabase
              </code>{' '}
              con datos reales.
            </>
          ) : (
            <>
              <strong>Sin permisos de importación.</strong> Solicita acceso a un
              administrador para importar recursos al catálogo.
            </>
          )}
        </div>
        <div className="mt-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/catalog">Volver al catálogo</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Importar catálogo"
        description="Carga recursos desde Excel o CSV: mapea columnas, revisa la vista previa y confirma el lote. Solo se crean recursos nuevos."
        breadcrumb={breadcrumb}
      />
      <CatalogImportWizard />
    </div>
  );
}
