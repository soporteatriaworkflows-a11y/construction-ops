/**
 * BOQ Workspace — .../estimates/[estimateId]/workspace
 * Oleada OPERATIONAL BUDGET UX V1. Contrato: OPERATIONAL_BUDGET_UX_V1_CONTRACT §3-§5.
 *
 * Server Component, request-time. RLS es la barrera real (cross-org ⇒ notFound).
 * Compone EXCLUSIVAMENTE el repositorio existente (sin nuevas mutaciones):
 * capítulos+ítems (incluye archivados; el filtro es visual), AIU, resumen
 * financiero server-side y desglose por capítulos (`computeChapterBreakdown`).
 * El Simulador comercial es un panel SEPARADO, read-only, sin persistencia.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid, PieChart, SlidersHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EstimateVersionBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { formatCOP, formatPct, ESTIMATE_VERSION_STATUS_LABELS } from '@/lib/utils/format';
import { resolveViewer } from '@/server/auth/resolve-viewer';
import {
  getEstimatesWriteRepository,
  EstimateNotFoundError,
  computeChapterBreakdown,
} from '@/server/estimates';
import type { WorkspaceChapterData } from '@/lib/estimates/workspace-view';
import { isVersionEditable } from '@/lib/estimates/workspace-view';
import { isCreationModeEnabled } from '../../../../../../mode-guard';
import { listApusForBoqAdd, type ApuAddOption } from '@/server/apu-builder';
import type { AuthenticatedViewer } from '@/server/auth/types';
import { formatVersionLabel } from '../../../estimate-format';
import { BoqWorkspace } from './boq-workspace';
import { AddApuPanel } from './add-apu-panel';
import { CommercialSimulator } from './commercial-simulator';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string; scopeId: string; estimateId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BoqWorkspacePage({ params, searchParams }: PageProps) {
  const { id, scopeId, estimateId } = await params;
  const sp = searchParams ? await searchParams : {};
  // Deep-link desde el asistente: ?apu=missing activa el filtro "Sin APU".
  const apuParam = typeof sp.apu === 'string' ? sp.apu : '';
  const initialApuFilter: 'all' | 'with' | 'without' =
    apuParam === 'missing' ? 'without' : apuParam === 'with' ? 'with' : 'all';
  const basePath = `/projects/${id}/scopes/${scopeId}/estimates/${estimateId}`;

  let viewer: Awaited<ReturnType<typeof resolveViewer>>;
  try {
    viewer = await resolveViewer();
  } catch {
    notFound();
  }

  const repo = getEstimatesWriteRepository();
  let estimate: Awaited<ReturnType<typeof repo.getEstimateById>>;
  try {
    estimate = await repo.getEstimateById(viewer, estimateId);
  } catch (e) {
    if (e instanceof EstimateNotFoundError) notFound();
    notFound();
  }
  if (estimate.projectScopeId !== scopeId) notFound();

  const active = estimate.activeVersion;
  if (!active || (active.chapterCount === 0 && active.itemCount === 0)) {
    // Sin contenido: el workspace no aplica; volver al detalle (importación).
    return (
      <div>
        <PageHeader
          title={`${estimate.name} — Workspace`}
          breadcrumb={<BackLink href={basePath} />}
        />
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">
          Esta versión todavía no tiene capítulos ni ítems. Importa el Excel o crea
          capítulos desde el{' '}
          <Link href={basePath} className="text-iconic-primary hover:underline">
            detalle del presupuesto
          </Link>
          .
        </div>
      </div>
    );
  }

  // Capítulos (incluye archivados; el filtro del workspace es visual) + ítems.
  const chapters = await repo.listChaptersByEstimateVersion(viewer, estimateId, {
    includeArchived: true,
  });
  const data: WorkspaceChapterData[] = await Promise.all(
    chapters.map(async (chapter) => ({
      chapter,
      items: await repo.listItemsByChapter(viewer, chapter.id, { includeArchived: true }),
    })),
  );

  // Resumen financiero + AIU + desglose (todo server-derived).
  const [financialSummary, aiu] = await Promise.all([
    repo.calculateEstimateFinancialSummary(viewer, estimateId),
    repo.getEstimateVersionAiu(viewer, estimateId).catch(() => null),
  ]);
  const breakdown = computeChapterBreakdown(chapters);

  const canEdit = isCreationModeEnabled();
  const versionEditable = isVersionEditable(active.status);
  const canMutate = canEdit && versionEditable;
  const statusLabel = ESTIMATE_VERSION_STATUS_LABELS[active.status] ?? active.status;

  // BOQ_ADD_FROM_APU_V1: APUs activos para agregar como ítem vinculado.
  // Solo se ofrece en versiones editables (issued ⇒ bloqueado server-side igual).
  let apuOptions: ApuAddOption[] = [];
  if (canMutate) {
    apuOptions = await listApusForBoqAdd(viewer as AuthenticatedViewer).catch(() => []);
  }
  const chapterOptions = chapters
    .filter((c) => !c.archived)
    .map((c) => ({ id: c.id, code: c.code, name: c.name }));

  return (
    <div>
      <PageHeader
        title={`${estimate.name} — Workspace`}
        breadcrumb={<BackLink href={basePath} />}
        description={`${formatVersionLabel(active.versionNumber)} · ${active.chapterCount} capítulos · ${active.itemCount} ítems`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <EstimateVersionBadge status={active.status} />
        {aiu && !aiu.isEmpty && (
          <span className="text-xs text-gray-500">
            AIU: A {aiu.administrationRate}% · I {aiu.contingencyRate}% · U {aiu.utilityRate}% ·
            IVA/U {aiu.utilityVatRate}%
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={basePath}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              AIU, versiones y exportar
            </Link>
          </Button>
        </span>
      </div>

      {/* BOQ_ADD_FROM_APU_V1 — Agregar actividad desde APU (solo versión editable) */}
      {canMutate && chapterOptions.length > 0 && (
        <section aria-label="Agregar actividad desde APU" className="mb-4">
          <AddApuPanel
            versionId={active.id}
            projectId={id}
            scopeId={scopeId}
            estimateId={estimateId}
            chapters={chapterOptions}
            apus={apuOptions}
          />
        </section>
      )}

      {/* A+B+C — Workspace denso con edición rápida y resumen financiero vivo */}
      <section aria-label="BOQ Workspace">
        <BoqWorkspace
          estimateId={estimateId}
          basePath={basePath}
          data={data}
          summary={financialSummary}
          canEdit={canEdit}
          canMutate={canMutate}
          versionStatusLabel={statusLabel}
          versionLocked={!versionEditable}
          initialApuFilter={initialApuFilter}
        />
      </section>

      {/* D — Desglose por capítulos (participación server-derived) */}
      <section aria-label="Desglose por capítulos" className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <PieChart className="h-4 w-4 text-gray-400" aria-hidden="true" />
          Desglose por capítulos
        </h2>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          {breakdown.rows.length === 0 ? (
            <p className="text-sm text-gray-400">Sin capítulos activos.</p>
          ) : (
            <ul className="space-y-2">
              {breakdown.rows.map((row) => (
                <li key={row.chapterId} className="grid grid-cols-[7rem_1fr_auto_auto] items-center gap-3 text-sm">
                  <span className="truncate font-mono text-xs text-gray-500" title={row.code}>
                    {row.code}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-gray-800" title={row.name}>{row.name}</span>
                    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-gray-100">
                      <span
                        className="block h-full rounded bg-iconic-primary"
                        style={{ width: `${Math.min(100, Math.max(0, parseFloat(row.share) * 100))}%` }}
                        aria-hidden="true"
                      />
                    </span>
                  </span>
                  <span className="w-16 text-right text-xs tabular-nums text-gray-500">
                    {formatPct(row.share)}
                  </span>
                  <span className="w-32 text-right font-medium tabular-nums text-iconic-ink">
                    {formatCOP(row.subtotal)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
            Participación sobre el costo directo activo ({formatCOP(breakdown.directTotal)}).
            El desglose por tipo de costo (materiales / mano de obra / equipos) requiere
            clasificación en el catálogo y queda registrado como deuda
            (COST_TYPE_BREAKDOWN_FOUNDATION).
          </p>
        </div>
      </section>

      {/* E+F — Simulador comercial (panel separado, sin persistencia) */}
      <section aria-label="Simulador comercial" className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          <LayoutGrid className="h-4 w-4 text-gray-400" aria-hidden="true" />
          Estrategia comercial
        </h2>
        <CommercialSimulator estimateId={estimateId} baseTotal={financialSummary.grandTotal} />
      </section>
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
    >
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
      Volver al presupuesto
    </Link>
  );
}
