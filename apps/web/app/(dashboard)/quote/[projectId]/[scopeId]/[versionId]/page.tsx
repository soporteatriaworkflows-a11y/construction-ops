/**
 * /quote/[projectId]/[scopeId]/[versionId] — Centro de cotización asistida
 * (QUOTING_ASSISTED_MODE_V1). Capa guiada ADITIVA sobre el sistema actual.
 *
 * Server Component. NO recalcula finanzas: reusa `getEstimateById` (contexto),
 * el semáforo existente (`computeQuoteReadiness` + `QuoteReadinessSemaphore`) y
 * deep-links a las rutas reales. El detalle del presupuesto y el workspace
 * técnico siguen intactos y accesibles.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import { getEstimatesWriteRepository, EstimateNotFoundError } from '@/server/estimates';
import { getReadModel } from '@/server/read-model';
import {
  computeQuoteReadiness,
  readinessExportMessage,
  type QuoteReadiness,
} from '@/lib/estimates/quote-readiness';
import { buildApuLibraryItemMap } from '@/lib/apu-library/from-summary';
import {
  QuoteReadinessSemaphore,
  ReadinessExportAlert,
} from '@/app/(dashboard)/projects/[id]/scopes/[scopeId]/estimates/[estimateId]/quote-readiness-semaphore';
import { QuoteStepper } from '../../../_components/quote-stepper';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ projectId: string; scopeId: string; versionId: string }>;
}

export default async function QuoteCenterPage({ params }: PageProps) {
  const { projectId, scopeId, versionId } = await params;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  let estimate: Awaited<
    ReturnType<ReturnType<typeof getEstimatesWriteRepository>['getEstimateById']>
  >;
  try {
    estimate = await getEstimatesWriteRepository().getEstimateById(viewer, versionId);
  } catch (e) {
    if (e instanceof EstimateNotFoundError) notFound();
    notFound();
  }
  // El presupuesto debe pertenecer al alcance/proyecto de la ruta.
  if (estimate.projectScopeId !== scopeId) notFound();

  const active = estimate.activeVersion;

  // Semáforo: MISMA carga que el detalle del presupuesto (sin recalcular finanzas).
  let readiness: QuoteReadiness | null = null;
  if (active) {
    try {
      const [detail, apus] = await Promise.all([
        getReadModel().getEstimateDetail(viewer, versionId),
        getReadModel().listApus(viewer).catch(() => []),
      ]);
      readiness = computeQuoteReadiness({
        estimate: detail.estimate,
        chapters: detail.chapters,
        items: detail.items,
        apusById: buildApuLibraryItemMap(apus),
      });
    } catch {
      readiness = null;
    }
  }

  const estimateHref = `/projects/${projectId}/scopes/${scopeId}/estimates/${versionId}`;

  return (
    <div>
      <PageHeader
        title="Cotización asistida"
        description="Te guiamos paso a paso reusando tu presupuesto, APU, cantidades, precios y exportación."
        breadcrumb={
          <Link href="/quote" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver al asistente
          </Link>
        }
      />

      {/* Contexto actual */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-iconic-soft-blue/60 bg-brand-50/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-iconic-ink">{estimate.name}</p>
          <p className="text-xs text-gray-500">
            <span className="font-mono">{estimate.code}</span>
            {estimate.scopeName ? ` · ${estimate.scopeName}` : ''}
            {estimate.projectName ? ` · ${estimate.projectName}` : ''}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={estimateHref}>
            Abrir presupuesto (workspace técnico)
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {/* Stepper de 8 pasos */}
      <QuoteStepper
        input={{
          context: { projectId, scopeId, versionId },
          estimate: active
            ? { status: active.status, chapterCount: active.chapterCount, itemCount: active.itemCount }
            : null,
          readiness,
        }}
      />

      {/* Semáforo embebido (reuso del componente existente) */}
      <section id="semaforo" className="mt-6 scroll-mt-20">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Semáforo de cotización</h2>
        {readiness ? (
          <div className="space-y-3">
            <QuoteReadinessSemaphore readiness={readiness} />
            <ReadinessExportAlert status={readiness.status} message={readinessExportMessage(readiness.status)} />
          </div>
        ) : (
          <p className="rounded-md border bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Aún no hay contenido suficiente para evaluar la cotización. Agrega capítulos, ítems y precios.
          </p>
        )}
      </section>
    </div>
  );
}
