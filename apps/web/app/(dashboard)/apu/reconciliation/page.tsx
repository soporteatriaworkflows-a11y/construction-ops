/**
 * /apu/reconciliation — Centro de reconciliación componente↔recurso
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1 §7). Server Component.
 *
 * Carga el universo de reconciliación (componentes no-labor) con su estado
 * dinámico y delega la interacción (selección, acciones individuales, modal
 * bulk, búsqueda, CSV) al cliente. Mutación solo management/internal; site/client
 * ven solo lectura. CSV sanitizado server-side.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { getReconciliationData, reconciliationCsv } from '@/server/apu-reconciliation';
import type { AuthenticatedViewer } from '@/server/auth/types';
import type { ReconciliationRow } from '@/lib/apu-reconciliation/types';
import { ReconciliationClient } from './_components/reconciliation-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ apu?: string }>;
}

export default async function ReconciliationPage({ searchParams }: PageProps) {
  const { apu } = await searchParams;

  if (!isCreationModeEnabled()) {
    return (
      <div>
        <Back />
        <PageHeader title="Centro de reconciliación de recursos" />
        <p className="rounded-md border bg-gray-50 px-4 py-3 text-sm text-gray-600">
          La reconciliación requiere modo autenticado (APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db).
        </p>
      </div>
    );
  }

  let rows: ReconciliationRow[] = [];
  let csv = '';
  let canMutate = false;
  let error: string | null = null;

  try {
    const viewer = await resolveViewer();
    canMutate = ['management', 'internal'].includes(viewer.role);
    const data = await getReconciliationData(viewer as AuthenticatedViewer);
    rows = apu ? data.rows.filter((r) => r.apuTemplateId === apu) : data.rows;
    csv = reconciliationCsv(rows);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar la reconciliación';
  }

  if (error) {
    return (
      <div>
        <Back />
        <PageHeader title="Centro de reconciliación de recursos" />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Back />
      <PageHeader
        title="Centro de reconciliación de recursos"
        description="Asocia los componentes APU importados con recursos del catálogo. Las sugerencias nunca se aceptan solas."
      />
      <ReconciliationClient initialRows={rows} csv={csv} canMutate={canMutate} apuFilter={apu ?? null} />
    </div>
  );
}

function Back() {
  return (
    <div className="mb-4">
      <Link href="/apu" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" />
        Volver a la biblioteca APU
      </Link>
    </div>
  );
}
