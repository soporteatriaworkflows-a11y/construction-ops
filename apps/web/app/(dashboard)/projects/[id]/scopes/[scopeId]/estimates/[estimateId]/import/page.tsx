/**
 * Página de importación de Excel — .../estimates/[estimateId]/import (4C.1).
 *
 * Propiedad: agent-frontend-boq. Contrato: `docs/EXCEL_IMPORT_CONTRACT.md §2`.
 *
 * Server Component, request-time. Valida modo + visibilidad del presupuesto +
 * que la versión activa sea importable (draft, vacía). Si ya tiene contenido,
 * muestra mensaje honesto (reimportación en fase posterior).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Info } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import { getEstimateImportStatus } from '@/server/estimates/import';
import { isCreationModeEnabled } from '../../../../../../mode-guard';
import { canImportBudgetData } from '@/server/access/budget-surface';
import { ImportFlow } from './import-flow';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string }>;
}

export default async function ImportEstimatePage({ params }: PageProps) {
  const { id, scopeId, estimateId } = await params;
  const backHref = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  // Estimate visible + pertenece a la ruta.
  try {
    const estimate = await getEstimatesWriteRepository().getEstimateById(viewer, estimateId);
    if (estimate.projectScopeId !== scopeId) notFound();
  } catch (e) {
    if (e instanceof EstimateNotFoundError) notFound();
    notFound();
  }

  // V5.6.6B: gate de modo + gate de ROL (solo editores de presupuesto).
  const canCreate = isCreationModeEnabled() && canImportBudgetData(viewer.profileRole);
  const status = await getEstimateImportStatus(viewer, estimateId).catch(() => null);

  const breadcrumb = (
    <Link
      href={backHref}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Volver al presupuesto
    </Link>
  );

  const blockedMessage = (msg: string) => (
    <div>
      <PageHeader title="Importar Excel" breadcrumb={breadcrumb} />
      <div
        className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        role="status"
        aria-live="polite"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{msg}</span>
      </div>
      <div className="mt-4">
        <Button asChild variant="outline" size="sm">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Volver al presupuesto
          </Link>
        </Button>
      </div>
    </div>
  );

  if (!canCreate) {
    return blockedMessage(
      'La importación requiere APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db (no disponible en modo demostración).',
    );
  }
  if (status?.hasContent) {
    return blockedMessage(
      'Esta versión ya contiene información. La reimportación estará disponible en una fase posterior.',
    );
  }
  if (status && !status.importable) {
    return blockedMessage('La versión del presupuesto no admite importación en este momento.');
  }

  return (
    <div>
      <PageHeader
        title="Importar Excel"
        description="Analiza el archivo (vista previa) y confirma para importar los capítulos e ítems a la versión V01."
        breadcrumb={breadcrumb}
      />
      <div className="max-w-3xl">
        <ImportFlow estimateId={estimateId} backHref={backHref} />
      </div>
    </div>
  );
}
