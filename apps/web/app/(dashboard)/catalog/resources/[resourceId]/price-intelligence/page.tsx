/**
 * Página de inteligencia de precios por recurso (Fase 3A).
 * Server Component. Propiedad: agent-frontend-boq.
 *
 * Privacidad:
 *  - Campos 🔒 (observedPrice, discountPercent, suggestedNetPrice) solo a roles internos.
 *  - approved_by no se muestra en ningún rol.
 *  - Botones aprobar/rechazar solo a admin/gerencia.
 */
import Link from 'next/link';
import { ArrowLeft, Calculator, History } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { isCreationModeEnabled } from '@/app/(dashboard)/projects/mode-guard';
import { EmptyState } from '@/components/shared/empty-state';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { getObservationRepository, getProviderRepository } from '@/server/pricing';
import type { ResourcePriceHistoryRow } from '@/server/pricing';
import { getMonitorRepository } from '@/server/pricing/monitor';
import type { MonitorTargetView, MonitorResultView } from '@/server/pricing/monitor';
import { ObservationForm } from './_components/observation-form';
import { UrlValidationPanel } from './_components/url-validation-panel';
import { MonitoringSection } from './_components/monitoring-section';
import { PriceHistoryTable } from './_components/price-history-table';

export const dynamic = 'force-dynamic';

// ViewerRole values: internal=admin/presupuestos/compras, management=gerencia
const INTERNAL_ROLES = ['internal', 'management'];
const APPROVE_ROLES = ['internal', 'management'];
const CREATE_ROLES = ['internal', 'management'];

const PRICE_HISTORY_LIMIT = 25;

function redactHistoryRows(rows: ResourcePriceHistoryRow[]): ResourcePriceHistoryRow[] {
  return rows.map((row) => ({
    ...row,
    supplierId: null,
    supplierName: null,
    observedPrice: null,
    discountPercent: null,
    suggestedNetPrice: null,
    currency: null,
    unit: null,
    sourceType: null,
    sourceReference: null,
    rejectionReason: null,
    notes: null,
    importBatchLabel: null,
    importBatchSourceReference: null,
    monitorWarnings: [],
    previousApprovedPrice: null,
    deltaAbs: null,
    deltaPct: null,
  }));
}

interface PageProps {
  params: Promise<{ resourceId: string }>;
}

export default async function PriceIntelligencePage({ params }: PageProps) {
  const { resourceId } = await params;

  let historyRows: ResourcePriceHistoryRow[] = [];
  let historyHasMore = false;
  let viewerRole = 'consulta';
  let canCreate = false;
  let canApprove = false;
  let showInternalFields = false;
  let error: string | null = null;
  let resourceCode = '';
  let resourceName = '';
  let resourceUnit = '';
  let providers: import('@/server/pricing').ProviderView[] = [];
  let monitorTargets: MonitorTargetView[] = [];
  let monitorResultsByTarget: Record<string, MonitorResultView[]> = {};

  try {
    const mode = resolveAuthMode();
    const obsRepo = getObservationRepository();
    const provRepo = getProviderRepository();
    const monitorRepo = getMonitorRepository();

    let effectiveViewer;
    if (mode === 'demo') {
      const viewer = await resolveViewer('demo');
      viewerRole = viewer.role;
      effectiveViewer = {
        userId: viewer.organizationId,
        profileId: viewer.organizationId,
        organizationId: viewer.organizationId,
        role: viewer.role,
      };
    } else {
      effectiveViewer = await resolveAuthenticatedViewer();
      viewerRole = effectiveViewer.role;
    }

    const rawHistoryRows = await obsRepo.listResourcePriceHistory(effectiveViewer, resourceId, PRICE_HISTORY_LIMIT + 1);
    historyRows = rawHistoryRows.slice(0, PRICE_HISTORY_LIMIT);
    historyHasMore = rawHistoryRows.length > PRICE_HISTORY_LIMIT;
    providers = await provRepo.listProviders(effectiveViewer);
    const summary = await obsRepo.getResourcePriceIntelligenceSummary(effectiveViewer, resourceId);
    if (summary) {
      resourceCode = summary.resourceCode;
      resourceName = summary.resourceName;
      resourceUnit = summary.resourceUnit;
    }

    // Monitoreo automático (Fase 4A): targets + historial breve por target.
    monitorTargets = await monitorRepo.listTargetsForResource(effectiveViewer, resourceId);
    const resultLists = await Promise.all(
      monitorTargets.map((t) => monitorRepo.listRecentResults(effectiveViewer, t.id, 3)),
    );
    monitorResultsByTarget = Object.fromEntries(
      monitorTargets.map((t, i) => [t.id, resultLists[i] ?? []]),
    );

    showInternalFields = INTERNAL_ROLES.includes(viewerRole);
    canCreate = CREATE_ROLES.includes(viewerRole);
    canApprove = APPROVE_ROLES.includes(viewerRole);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar inteligencia de precios';
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Inteligencia de precios" />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          Error: {error}
        </div>
      </div>
    );
  }

  const title = resourceName
    ? `${resourceCode} — ${resourceName}`
    : 'Inteligencia de precios';

  // CTA: iniciar un APU a partir de este recurso (no crea nada automáticamente;
  // preselecciona el material en el constructor). Solo roles internos + modo db.
  const canBuildApu = canCreate && isCreationModeEnabled();
  const visibleHistoryRows = showInternalFields ? historyRows : redactHistoryRows(historyRows);

  return (
    <div>
      <PageHeader
        title={title}
        description="Historial de observaciones de precio · Inteligencia de precios"
        breadcrumb={
          <Link href="/catalog" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Catálogo
          </Link>
        }
        actions={
          canBuildApu ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/apu/new?resourceId=${encodeURIComponent(resourceId)}`}>
                <Calculator className="mr-1 h-4 w-4" aria-hidden="true" />
                Crear APU usando este recurso
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Disclaimer visible a todos los roles */}
      <div
        className="mb-6 rounded bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800"
        role="note"
      >
        La validación web propone una observación. No modifica automáticamente presupuestos ni aprueba precios. Toda observación requiere revisión y aprobación manual.
      </div>

      {/* Formulario nueva observación + validación desde URL */}
      {canCreate && (
        <section aria-label="Nueva observación de precio" className="mb-8 space-y-8">
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Registrar nueva observación</h2>
            <div className="max-w-2xl">
              <ObservationForm resourceId={resourceId} resourceUnit={resourceUnit} providers={providers} />
            </div>
          </div>

          {/* Phase 3B — Validación supervisada desde URL pública */}
          <div>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Validar precio desde URL pública</h2>
            <div className="max-w-2xl">
              <UrlValidationPanel resourceId={resourceId} resourceUnit={resourceUnit} />
            </div>
          </div>
        </section>
      )}

      {/* Monitoreo automático (Fase 4A) — visible a todos; mutaciones solo roles autorizados */}
      <MonitoringSection
        resourceId={resourceId}
        targets={monitorTargets}
        resultsByTarget={monitorResultsByTarget}
        canMutate={canCreate}
      />

      {/* Historico y fuentes */}
      <section aria-label="Historico y fuentes" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-content">Historico y fuentes</h2>
            {historyHasMore && (
              <p className="mt-1 text-xs text-gray-500 dark:text-content-muted">Mostrando las ultimas 25 observaciones</p>
            )}
          </div>
          {canApprove && historyRows.some((o) => o.status === 'pending') && (
            <Link
              href="/catalog/prices/review"
              className="text-xs font-medium text-iconic-primary hover:underline"
            >
              Revisar pendientes en bloque -&gt;
            </Link>
          )}
        </div>

        {visibleHistoryRows.length === 0 ? (
          <EmptyState
            icon={History}
            title="Sin historico de precios"
            description="Aun no hay observaciones registradas para este recurso."
          />
        ) : (
          <PriceHistoryTable rows={visibleHistoryRows} showInternalFields={showInternalFields} />
        )}
      </section>
    </div>
  );
}
