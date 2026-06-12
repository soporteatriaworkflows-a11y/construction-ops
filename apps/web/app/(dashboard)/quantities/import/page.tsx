/**
 * Página de importación de memorias de cantidades — /quantities/import
 * (QUANTITY_TAKEOFF_IMPORT_V1, contrato §12). Server Component.
 * Propiedad: agent-frontend-boq (vía agent-orchestrator).
 *
 * Flujo supervisado: workbook → hoja CANTIDADES 1 PISO → preview con
 * fórmulas reconocidas, diferencias y vínculos BOQ → confirmación
 * idempotente → reporte. En modo demo/read-only se explica por qué no está
 * disponible (sin botones rotos).
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { QuantityImportWizard } from './_components/quantity-import-wizard';

export const dynamic = 'force-dynamic';

export default async function QuantityImportPage() {
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
      href="/quantities"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Cantidades
    </Link>
  );

  if (!canImport) {
    return (
      <div>
        <PageHeader title="Importar memorias de cantidades" breadcrumb={breadcrumb} />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
        >
          {isDemoMode ? (
            <>
              <strong>Modo demostración activo.</strong> La importación de cantidades no
              está disponible. Requiere{' '}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">
                APP_AUTH_MODE=supabase
              </code>{' '}
              con datos reales.
            </>
          ) : (
            <>
              <strong>Acceso restringido.</strong> La importación de cantidades está
              disponible solo para gerencia y administración.
            </>
          )}
        </div>
        <div className="mt-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/quantities">Volver a Cantidades</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Importar memorias de cantidades"
        description="Carga la hoja CANTIDADES 1 PISO del workbook del proyecto: detecta grupos y líneas de medición, reconoce las fórmulas geométricas, recalcula los subtotales en el servidor y vincula con el presupuesto solo las coincidencias exactas. El BOQ no se modifica: el total importado queda como memoria trazable para revisión."
        breadcrumb={breadcrumb}
      />
      <QuantityImportWizard />
    </div>
  );
}
