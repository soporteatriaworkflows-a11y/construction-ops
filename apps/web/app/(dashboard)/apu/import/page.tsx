/**
 * Página de importación estructurada de APU — /apu/import
 * (ENTRE_PATIOS_APU_IMPORT_V1 + BOQ_APU_LINKING_V1). Server Component.
 * Propiedad: agent-frontend-boq (vía agent-orchestrator).
 *
 * Flujo supervisado: workbook → hoja APU → preview con advertencias →
 * confirmación idempotente → reporte. En modo demo/read-only se explica por
 * qué no está disponible (sin botones rotos).
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { ApuImportWizard } from './_components/apu-import-wizard';

export const dynamic = 'force-dynamic';

export default async function ApuImportPage() {
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
      href="/apu"
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      APU
    </Link>
  );

  if (!canImport) {
    return (
      <div>
        <PageHeader title="Importar APU" breadcrumb={breadcrumb} />
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          role="status"
        >
          {isDemoMode ? (
            <>
              <strong>Modo demostración activo.</strong> La importación de APU no está
              disponible. Requiere{' '}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">
                APP_AUTH_MODE=supabase
              </code>{' '}
              con datos reales.
            </>
          ) : (
            <>
              <strong>Acceso restringido.</strong> La importación de APU está disponible
              solo para gerencia y administración.
            </>
          )}
        </div>
        <div className="mt-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/apu">Volver a APU</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Importar APU"
        description="Carga la hoja APU del workbook del proyecto: detecta actividades y componentes, revisa la vista previa con advertencias y confirma la importación. Nada se sobrescribe y ningún precio se aprueba automáticamente."
        breadcrumb={breadcrumb}
      />
      <ApuImportWizard />
    </div>
  );
}
