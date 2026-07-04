/**
 * Centro de monitoreo automático de precios — /catalog/monitoring (Fase 4A).
 * Server Component. Propiedad: agent-frontend-boq / agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §6.2.
 *
 * Roles: management/internal ven y mutan; site/client solo lectura (sin
 * botones — decisión server-side; los guards reales viven en las actions y RLS).
 */
import Link from 'next/link';
import { ArrowLeft, Radar } from 'lucide-react';
import { OperationsHeader } from '@/components/shared/operations-header';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineCallout } from '@/components/shared/inline-callout';
import { KpiCard, KpiBand } from '@/components/shared/kpi-card';
import { Badge } from '@/components/ui/badge';
import { resolveViewer, resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { requireModuleAccess } from '@/server/access';
import { getMonitorRepository } from '@/server/pricing/monitor';
import type { MonitorTargetView, MonitorRunView, MonitorRunResultDetailView, MonitoringSummary } from '@/server/pricing/monitor';
import {
  getMonitorTargetStatus,
  formatLastChecked,
  formatNextCheck,
  parseMonitorStatus,
  filterTargetsByStatus,
  getMonitorStatusCounts,
  getRunStatusLabel,
  getRunStatusTone,
  formatRunDuration,
  formatRunStartedRelative,
  summarizeRunCounters,
  getLatestProblemRun,
  getResultStatusLabel,
  getResultStatusTone,
  getSuggestedMonitorAction,
  formatDetectedPrice,
  MONITOR_FILTER_LABELS,
  type MonitorTone,
  type MonitorFilterStatus,
} from '@/lib/pricing/monitor-ui';
import { RunNowButton, TargetToggleButton, CadenceForm } from './_components/monitor-controls';
import { getFriendlyDataLoadError } from '@/lib/db/errors';

export const dynamic = 'force-dynamic';

const MUTATION_ROLES = ['management', 'internal'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

// Estado operativo vía helper NEUTRO (server-safe). El badge mapea tono→variante.
const TONE_VARIANT: Record<MonitorTone, 'success' | 'warning' | 'destructive' | 'outline'> = {
  success: 'success',
  warn: 'warning',
  danger: 'destructive',
  muted: 'outline',
};
function targetStatusBadge(t: MonitorTargetView) {
  const s = getMonitorTargetStatus(t);
  return <Badge variant={TONE_VARIANT[s.tone]}>{s.label}</Badge>;
}

function runStatusBadge(r: MonitorRunView) {
  return <Badge variant={TONE_VARIANT[getRunStatusTone(r.status)]}>{getRunStatusLabel(r.status)}</Badge>;
}

function resultStatusBadge(status: MonitorRunResultDetailView['status']) {
  return <Badge variant={TONE_VARIANT[getResultStatusTone(status)]}>{getResultStatusLabel(status)}</Badge>;
}

const MONITOR_FILTER_ORDER: MonitorFilterStatus[] = ['all', 'healthy', 'overdue', 'error', 'paused'];
const RECENT_RUN_LIMIT = 5;
const RUN_RESULT_LIMIT = 10;
type RunResultsById = Record<string, { results: MonitorRunResultDetailView[]; hasMore: boolean }>;


/** Pills de filtro server-rendered (`<Link>`, sin isla client). V5.2.2b. */
function MonitorFilterPills({ status, counts }: { status: MonitorFilterStatus; counts: Record<MonitorFilterStatus, number> }) {
  return (
    <div role="group" aria-label="Filtrar por estado" className="mb-3 flex flex-wrap gap-1.5">
      {MONITOR_FILTER_ORDER.map((key) => {
        const active = key === status;
        const href = key === 'all' ? '/catalog/monitoring' : `/catalog/monitoring?status=${key}`;
        return (
          <Link
            key={key}
            href={href}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? 'border-iconic-primary bg-iconic-primary text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-iconic-primary/50 hover:text-iconic-primary dark:border-line dark:bg-surface dark:text-content-muted'
            }`}
          >
            {MONITOR_FILTER_LABELS[key]}
            <span className={`tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>{counts[key]}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default async function MonitoringCenterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // V5.6.2: guard de módulo server-side. `monitoring` = admin/gerencia/compras.
  await requireModuleAccess('monitoring');
  const status = parseMonitorStatus((await searchParams).status);
  let viewerRole = 'consulta';
  let targets: MonitorTargetView[] = [];
  let runs: MonitorRunView[] = [];
  let runResultsById: RunResultsById = {};
  let summary: MonitoringSummary | null = null;
  let error: string | null = null;

  try {
    const mode = resolveAuthMode();
    const repo = getMonitorRepository();

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

    targets = await repo.listTargets(viewer);
    runs = await repo.listRecentRuns(viewer, RECENT_RUN_LIMIT);
    try {
      summary = await repo.getMonitoringSummary(viewer);
    } catch {
      summary = null;
    }

    for (const run of runs) {
      try {
        const rows = await repo.listRunResults(viewer, run.id, RUN_RESULT_LIMIT + 1);
        runResultsById[run.id] = {
          results: rows.slice(0, RUN_RESULT_LIMIT),
          hasMore: rows.length > RUN_RESULT_LIMIT,
        };
      } catch {
        runResultsById[run.id] = { results: [], hasMore: false };
      }
    }
  } catch (e) {
    error = getFriendlyDataLoadError(e, 'No pudimos cargar el monitoreo en este momento. Intenta actualizar en unos segundos.');
  }

  const canMutate = MUTATION_ROLES.includes(viewerRole);
  // V5.2.2b — filtrado server-side por estado (sin isla client). Conteos sobre TODOS.
  const statusCounts = getMonitorStatusCounts(targets);
  const visibleTargets = filterTargetsByStatus(targets, status);

  if (error) {
    return (
      <div>
        <OperationsHeader eyebrow="Catálogo · Precios" title="Monitoreo de precios" subtitle="Panel operativo del agente de monitoreo." />
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-200" role="alert">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link href="/catalog" className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-iconic-primary dark:text-content-muted">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Catálogo
      </Link>
      <OperationsHeader
        eyebrow="Catálogo · Precios"
        title="Monitoreo de precios"
        subtitle="Agente automático: revisa fuentes públicas habilitadas y propone observaciones pendientes. Nunca aprueba automáticamente."
        stat={{ label: 'Bajo monitoreo', value: String(summary?.monitoredCount ?? 0) }}
      />

      {/* Resumen accionable */}
      {summary && (
        <KpiBand className="mb-4 mt-4">
          <KpiCard label="Bajo monitoreo" value={summary.monitoredCount} hint="Fuentes totales" />
          <KpiCard label="Activas" value={summary.activeCount} tone={summary.activeCount > 0 ? 'ok' : 'default'} hint="Vigiladas" />
          <KpiCard label="Pausadas" value={summary.pausedCount} hint="Sin revisar" href="/catalog/monitoring?status=paused" />
          <KpiCard label="Atrasadas" value={summary.overdueCount} tone={summary.overdueCount > 0 ? 'warn' : 'default'} hint="Toca revisar" href="/catalog/monitoring?status=overdue" />
          <KpiCard label="Cambios pendientes" value={summary.pendingChangesCount} tone={summary.pendingChangesCount > 0 ? 'warn' : 'default'} hint="Por aprobar" href="/catalog/prices/review" />
          <KpiCard label="Con error" value={summary.erroredCount} tone={summary.erroredCount > 0 ? 'danger' : 'default'} hint="Fallos repetidos" href="/catalog/monitoring?status=error" />
        </KpiBand>
      )}

      {/* Callouts operativos (suaves, datos existentes) */}
      {summary && (summary.overdueCount > 0 || summary.erroredCount > 0 || summary.pendingChangesCount > 0 || !summary.lastRunAt) && (
        <div className="mb-6 space-y-2">
          {summary.erroredCount > 0 && (
            <InlineCallout tone="warning" title="Fuentes con errores repetidos">
              {summary.erroredCount} fuente(s) acumulan fallos. Revisa su URL o proveedor en la tabla.
            </InlineCallout>
          )}
          {summary.overdueCount > 0 && (
            <InlineCallout tone="warning" title="Revisiones atrasadas">
              {summary.overdueCount} fuente(s) ya pasaron su próxima revisión. Puedes ejecutar una revisión manual.
            </InlineCallout>
          )}
          {summary.pendingChangesCount > 0 && (
            <InlineCallout tone="tip" title="Cambios pendientes de aprobación">
              {summary.pendingChangesCount} observación(es) propuestas por el monitor.{' '}
              <Link href="/catalog/prices/review" className="font-medium underline">Revisar precios</Link>.
            </InlineCallout>
          )}
          {!summary.lastRunAt && (
            <InlineCallout tone="info" title="Sin corridas todavía">
              El monitor aún no ha ejecutado ninguna revisión.
            </InlineCallout>
          )}
        </div>
      )}

      {/* Última ejecución + acción manual */}
      <section aria-label="Ejecución" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-line dark:bg-surface">
        <div className="text-sm text-gray-600 dark:text-content-muted">
          Última ejecución:{' '}
          <span className="font-medium text-iconic-ink dark:text-content">{formatDate(summary?.lastRunAt ?? null)}</span>
          <span className="ml-2 text-xs text-gray-400">Cron diario 06:00 (hora Colombia)</span>
        </div>
        {canMutate && <RunNowButton />}
      </section>

      {/* Tabla de fuentes */}
      <section aria-label="Fuentes monitoreadas" className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-content">Fuentes ({statusCounts.all})</h2>
        {targets.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="Sin fuentes monitoreadas"
            description="Habilita «Monitorear esta fuente» desde la inteligencia de precios de un recurso del catálogo."
          />
        ) : (
          <>
            <MonitorFilterPills status={status} counts={statusCounts} />
            {visibleTargets.length === 0 ? (
              <EmptyState
                icon={Radar}
                title={`No hay fuentes ${MONITOR_FILTER_LABELS[status].toLowerCase()}`}
                description="Cambia el filtro para ver otras fuentes monitoreadas."
              />
            ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm dark:border-line dark:bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500 dark:border-line dark:bg-surface-soft dark:text-content-muted">
                  <th className="px-3 py-2">Recurso</th>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Frecuencia</th>
                  <th className="px-3 py-2">Última revisión</th>
                  <th className="px-3 py-2">Próxima revisión</th>
                  <th className="px-3 py-2">Estado</th>
                  {canMutate && <th className="px-3 py-2">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {visibleTargets.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0 dark:border-line/60">
                    <td className="px-3 py-2">
                      <Link
                        href={`/catalog/resources/${t.resourceId}/price-intelligence`}
                        className="font-medium text-iconic-primary hover:underline"
                      >
                        {t.resourceCode}
                      </Link>
                      <p className="text-xs text-gray-500">{t.resourceName}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{t.supplierName ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span className="block max-w-[220px] truncate text-xs text-gray-500" title={t.sourceUrl}>
                        {t.sourceUrl}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {canMutate ? (
                        <CadenceForm targetId={t.id} cadenceDays={t.cadenceDays} />
                      ) : (
                        `${t.cadenceDays} días`
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-content-muted" title={formatDate(t.lastCheckedAt)}>{formatLastChecked(t.lastCheckedAt)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 dark:text-content-muted" title={formatDate(t.nextCheckAt)}>{formatNextCheck(t.nextCheckAt)}</td>
                    <td className="px-3 py-2">{targetStatusBadge(t)}</td>
                    {canMutate && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {t.enabled && <RunNowButton targetId={t.id} />}
                          <TargetToggleButton targetId={t.id} enabled={t.enabled} />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
            )}
          </>
        )}
      </section>

      {/* Corridas recientes - detalles operativos (V5.4.3) */}
      <section aria-label="Corridas recientes">
        <h2 className="mb-3 text-sm font-semibold text-gray-700 dark:text-content">Corridas recientes</h2>

        {(() => {
          const problem = getLatestProblemRun(runs);
          return problem ? (
            <InlineCallout tone="warning" title="Ultima corrida con incidencias" className="mb-3">
              {getRunStatusLabel(problem.status)} - {formatRunStartedRelative(problem.startedAt)}
              {problem.errorSummary ? ` - ${problem.errorSummary}` : ''}
            </InlineCallout>
          ) : null;
        })()}

        {runs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-content-muted">Aun no hay corridas del monitor.</p>
        ) : (
          <div className="space-y-3">
            {runs.map((r) => {
              const details = runResultsById[r.id] ?? { results: [], hasMore: false };
              const fallbackAction = r.status === 'running' ? getSuggestedMonitorAction('running') : getSuggestedMonitorAction(null);
              return (
                <details
                  key={r.id}
                  className="group rounded-lg border border-gray-200 bg-white shadow-sm open:border-iconic-primary/40 dark:border-line dark:bg-surface"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 marker:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        {runStatusBadge(r)}
                        <span className="text-xs text-gray-500 dark:text-content-muted">
                          {r.triggerType === 'scheduled' ? 'Programada' : 'Manual'}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-content-muted" title={formatDate(r.startedAt)}>
                          {formatRunStartedRelative(r.startedAt)}
                        </span>
                        <span className="text-xs text-gray-400">- {formatRunDuration(r.startedAt, r.finishedAt, r.status)}</span>
                      </div>
                      {r.errorSummary && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{r.errorSummary}</p>}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {summarizeRunCounters(r.counters).map((chip) => (
                        <span
                          key={String(chip.key)}
                          className={`rounded px-1.5 py-0.5 text-[11px] tabular-nums ${
                            chip.key === 'failed' && chip.value > 0
                              ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-surface-soft dark:text-content-muted'
                          }`}
                        >
                          {chip.label} {chip.value}
                        </span>
                      ))}
                    </div>
                  </summary>

                  <div className="border-t border-gray-100 px-4 py-3 dark:border-line/60">
                    {details.results.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-content-muted">{fallbackAction}</p>
                    ) : (
                      <div className="space-y-2">
                        {details.results.map((result) => (
                          <div key={result.id} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 dark:border-line/70 dark:bg-surface-soft">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-iconic-ink dark:text-content">
                                  {result.resourceCode ? `${result.resourceCode} - ` : ''}{result.resourceName || 'Recurso sin nombre'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-content-muted">Proveedor: {result.supplierName ?? 'Sin proveedor'}</p>
                              </div>
                              {resultStatusBadge(result.status)}
                            </div>
                            <dl className="mt-2 grid gap-2 text-xs text-gray-600 dark:text-content-muted sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <dt className="font-medium text-gray-500">Precio detectado</dt>
                                <dd>{formatDetectedPrice(result.detectedPrice, result.currency)}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Moneda / unidad</dt>
                                <dd>{[result.currency, result.unit].filter(Boolean).join(' / ') || 'Sin dato'}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Checked at</dt>
                                <dd>{formatDate(result.checkedAt)}</dd>
                              </div>
                              <div>
                                <dt className="font-medium text-gray-500">Observacion</dt>
                                <dd>{result.observationId ? 'Vinculada' : 'Sin observacion'}</dd>
                              </div>
                            </dl>
                            {result.warnings.length > 0 && (
                              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Warnings: {result.warnings.join(', ')}</p>
                            )}
                            <p className="mt-2 text-xs font-medium text-gray-700 dark:text-content">Accion sugerida: {getSuggestedMonitorAction(result.status)}</p>
                          </div>
                        ))}
                        {details.hasMore && (
                          <p className="text-xs text-gray-500 dark:text-content-muted">Mostrando los primeros {RUN_RESULT_LIMIT} resultados de esta corrida.</p>
                        )}
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}