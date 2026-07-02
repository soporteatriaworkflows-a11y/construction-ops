/**
 * Centro de Revisión de Precios — /catalog/prices/review
 * (PRICE_OBSERVATION_REVIEW_CENTER_V1 + BULK_APPROVAL_BY_IMPORT_BATCH_V1).
 * Server Component. Propiedad: agent-frontend-boq / agent-pricing.
 * Contrato: docs/PRICE_OBSERVATION_REVIEW_CENTER_V1_CONTRACT.md §8.
 *
 * Privacidad backend-first: precios observados/descuentos/netos son campos 🔒.
 * Roles site/client NO reciben los datos (la página no los serializa); solo
 * management/internal ven la tabla y pueden actuar (RLS exige admin/gerencia
 * para el UPDATE real).
 */
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck, AlertTriangle, Boxes, Radar, Building2, ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { InlineCallout } from '@/components/shared/inline-callout';
import { EmptyState } from '@/components/shared/empty-state';
import { resolveViewer, resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import {
  getReviewRepository,
  computeReviewSummary,
  MAX_BULK_ROWS,
  REVIEW_LIST_LIMIT,
} from '@/server/pricing/review';
import type {
  PendingReviewObservationView,
  ReviewBatchView,
  OperationalReviewConsole as OperationalReviewConsoleData,
  ReviewSummary,
} from '@/server/pricing/review';
import { OperationalReviewConsole } from './_components/operational-review-console';
import { ReviewTable } from './_components/review-table';

export const dynamic = 'force-dynamic';

const REVIEW_ROLES = ['management', 'internal'];

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: 'warn';
}) {
  const toneClass = tone === 'warn' ? 'text-amber-700' : 'text-iconic-ink';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
        <span className="text-iconic-primary">{icon}</span>
        {label}
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

export default async function PriceReviewCenterPage() {
  let viewerRole = 'consulta';
  let observations: PendingReviewObservationView[] = [];
  let batches: ReviewBatchView[] = [];
  let summary: ReviewSummary | null = null;
  let operationalConsole: OperationalReviewConsoleData | null = null;
  let error: string | null = null;

  const mode = resolveAuthMode();

  try {
    let viewer;
    if (mode === 'demo') {
      const demo = await resolveViewer('demo');
      viewerRole = demo.role;
      viewer = {
        userId: demo.organizationId,
        profileId: demo.organizationId,
        organizationId: demo.organizationId,
        role: demo.role,
      };
    } else {
      viewer = await resolveAuthenticatedViewer();
      viewerRole = viewer.role;
    }

    // Privacidad backend-first: solo roles autorizados cargan datos 🔒.
    if (REVIEW_ROLES.includes(viewerRole)) {
      const repo = getReviewRepository();
      [observations, batches, operationalConsole] = await Promise.all([
        repo.listPendingObservations(viewer, REVIEW_LIST_LIMIT),
        repo.listBatches(viewer),
        repo.getOperationalReviewConsole(viewer),
      ]);
      summary = computeReviewSummary(observations, batches);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar la revisión de precios';
  }

  const canReview = REVIEW_ROLES.includes(viewerRole);

  if (error) {
    return (
      <div>
        <PageHeader title="Revisión de precios" />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Revisión de precios"
        description="Revisa y aprueba en bloque las observaciones de precio pendientes. Lo aprobado se convierte en el baseline para futuras comparaciones del monitor."
        breadcrumb={
          <span className="inline-flex items-center gap-3 text-sm">
            <Link href="/catalog" className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Catálogo
            </Link>
            <Link href="/catalog/monitoring" className="text-gray-500 hover:text-iconic-primary">
              Monitoreo
            </Link>
          </span>
        }
      />

      {canReview && (
        <InlineCallout tone="tip" title="Cómo leer los precios" className="mb-4">
          <strong>Aprobado</strong> = baseline vigente · <strong>Pendiente</strong> = por revisar ·
          <strong> Manual</strong> = capturado a mano · <strong>Sin proveedor</strong> = falta fuente.
          Aprueba en bloque lo correcto para fijar el baseline de comparación.
        </InlineCallout>
      )}

      {!canReview ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Acceso restringido"
          description="La revisión de precios contiene información interna (precios observados y descuentos). Solo los roles de gerencia e internos pueden acceder."
        />
      ) : (
        <>
          {mode === 'demo' && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800" role="note">
              Modo demostración: la revisión masiva opera únicamente con datos reales
              (APP_AUTH_MODE=supabase y READ_MODEL_SOURCE=db).
            </div>
          )}

          {operationalConsole && <OperationalReviewConsole consoleData={operationalConsole} />}

          {summary && (
            <section aria-label="Resumen de revisión" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <SummaryCard label="Pendientes" value={summary.pendingCount} icon={<ListChecks className="h-4 w-4" aria-hidden="true" />} />
              <SummaryCard
                label="Con advertencias"
                value={summary.withWarningsCount}
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                tone={summary.withWarningsCount > 0 ? 'warn' : undefined}
              />
              <SummaryCard label="Proveedores" value={summary.supplierCount} icon={<Building2 className="h-4 w-4" aria-hidden="true" />} />
              <SummaryCard label="Lotes" value={summary.batchCount} icon={<Boxes className="h-4 w-4" aria-hidden="true" />} />
              <SummaryCard
                label="Detectadas por el monitor"
                value={summary.monitorPendingCount}
                icon={<Radar className="h-4 w-4" aria-hidden="true" />}
                tone={summary.monitorPendingCount > 0 ? 'warn' : undefined}
              />
            </section>
          )}

          {observations.length === 0 ? (
            <EmptyState
              icon={ClipboardCheck}
              title="Sin observaciones pendientes"
              description="Cuando importes un catálogo o una lista de precios, o el monitor detecte cambios, las observaciones pendientes aparecerán aquí para su revisión."
            />
          ) : (
            <ReviewTable
              observations={observations}
              batches={batches}
              canReview={canReview && mode !== 'demo'}
              maxBulkRows={MAX_BULK_ROWS}
            />
          )}
        </>
      )}
    </div>
  );
}
