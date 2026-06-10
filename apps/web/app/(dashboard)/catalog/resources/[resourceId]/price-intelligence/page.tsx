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
import { ArrowLeft, TrendingDown, Clock, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { getObservationRepository, getProviderRepository } from '@/server/pricing';
import type { ResourcePriceObservationView } from '@/server/pricing';
import { formatCOP } from '@/lib/utils/format';
import { ObservationForm } from './_components/observation-form';
import { ApproveButton, RejectButton } from './_components/observation-review-buttons';
import { UrlValidationPanel } from './_components/url-validation-panel';

export const dynamic = 'force-dynamic';

// ViewerRole values: internal=admin/presupuestos/compras, management=gerencia
const INTERNAL_ROLES = ['internal', 'management'];
const APPROVE_ROLES = ['internal', 'management'];
const CREATE_ROLES = ['internal', 'management'];

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline' | 'secondary' }> = {
  approved: { label: 'Aprobada', variant: 'success' },
  pending: { label: 'Pendiente', variant: 'warning' },
  rejected: { label: 'Rechazada', variant: 'destructive' },
  expired: { label: 'Expirada', variant: 'outline' },
};

function statusBadge(status: string, isStale: boolean) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: 'outline' as const };
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={cfg.variant}>{cfg.label}</Badge>
      {isStale && <Badge variant="outline" className="text-orange-600 border-orange-300">Vencida</Badge>}
    </span>
  );
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

interface PageProps {
  params: Promise<{ resourceId: string }>;
}

export default async function PriceIntelligencePage({ params }: PageProps) {
  const { resourceId } = await params;

  let observations: ResourcePriceObservationView[] = [];
  let viewerRole = 'consulta';
  let canCreate = false;
  let canApprove = false;
  let showInternalFields = false;
  let error: string | null = null;
  let resourceCode = '';
  let resourceName = '';
  let resourceUnit = '';
  let providers: import('@/server/pricing').ProviderView[] = [];

  try {
    const mode = resolveAuthMode();
    const obsRepo = getObservationRepository();
    const provRepo = getProviderRepository();

    if (mode === 'demo') {
      const viewer = await resolveViewer('demo');
      viewerRole = viewer.role;
      const demoViewer = {
        userId: viewer.organizationId,
        profileId: viewer.organizationId,
        organizationId: viewer.organizationId,
        role: viewer.role,
      };
      observations = await obsRepo.listResourcePriceObservations(demoViewer, resourceId);
      providers = await provRepo.listProviders(demoViewer);
      const summary = await obsRepo.getResourcePriceIntelligenceSummary(demoViewer, resourceId);
      if (summary) {
        resourceCode = summary.resourceCode;
        resourceName = summary.resourceName;
        resourceUnit = summary.resourceUnit;
      }
    } else {
      const authed = await resolveAuthenticatedViewer();
      viewerRole = authed.role;
      observations = await obsRepo.listResourcePriceObservations(authed, resourceId);
      providers = await provRepo.listProviders(authed);
      const summary = await obsRepo.getResourcePriceIntelligenceSummary(authed, resourceId);
      if (summary) {
        resourceCode = summary.resourceCode;
        resourceName = summary.resourceName;
        resourceUnit = summary.resourceUnit;
      }
    }

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
      />

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

      {/* Historial de observaciones */}
      <section aria-label="Historial de observaciones">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Historial ({observations.length})
        </h2>

        {observations.length === 0 ? (
          <EmptyState
            icon={TrendingDown}
            title="Sin observaciones"
            description="No hay observaciones de precio registradas para este recurso."
          />
        ) : (
          <div className="space-y-3">
            {observations.map((obs) => (
              <div
                key={obs.id}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                aria-label={`Observación ${obs.id.slice(0, 8)} — ${obs.status}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {statusBadge(obs.status, obs.isStale)}
                      {obs.supplierName && (
                        <span className="text-xs text-gray-500">{obs.supplierName}</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {formatDate(obs.observedAt)}
                      </span>
                    </div>

                    {/* Campos 🔒 — solo roles internos */}
                    {showInternalFields && (
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-sm font-semibold tabular-nums text-gray-900">
                          {formatCOP(obs.observedPrice)}
                          <span className="ml-1 text-xs font-normal text-gray-500">/{obs.unit}</span>
                        </span>
                        {Number(obs.discountPercent) > 0 && (
                          <span className="text-xs text-emerald-600">
                            −{Number(obs.discountPercent).toFixed(2)}% → {formatCOP(obs.suggestedNetPrice)}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {obs.sourceType}
                      </span>
                      {obs.sourceReference && (
                        <span className="truncate max-w-[200px]">{obs.sourceReference}</span>
                      )}
                      {obs.validUntil && (
                        <span className="text-orange-600">Hasta {formatDate(obs.validUntil)}</span>
                      )}
                    </div>

                    {obs.notes && (
                      <p className="text-xs text-gray-600 mt-1">{obs.notes}</p>
                    )}

                    {obs.status === 'rejected' && obs.rejectionReason && (
                      <div className="mt-1 flex items-start gap-1 text-xs text-red-700">
                        <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{obs.rejectionReason}</span>
                      </div>
                    )}

                    {obs.status === 'approved' && obs.approvedAt && (
                      <div className="mt-1 flex items-start gap-1 text-xs text-green-700">
                        <CheckCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>Aprobada el {formatDate(obs.approvedAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Acciones de revisión — solo admin/gerencia para observaciones pending */}
                  {canApprove && obs.status === 'pending' && (
                    <div className="flex items-center gap-2 shrink-0">
                      <ApproveButton observationId={obs.id} resourceId={resourceId} />
                      <RejectButton observationId={obs.id} resourceId={resourceId} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
