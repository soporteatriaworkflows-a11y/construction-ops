/**
 * Centro de monitoreo automático de precios — /catalog/monitoring (Fase 4A).
 * Server Component. Propiedad: agent-frontend-boq / agent-pricing.
 * Contrato: docs/PRICE_MONITORING_AGENT_V1_CONTRACT.md §6.2.
 *
 * Roles: management/internal ven y mutan; site/client solo lectura (sin
 * botones — decisión server-side; los guards reales viven en las actions y RLS).
 */
import Link from 'next/link';
import { ArrowLeft, Radar, AlertTriangle, Clock, PauseCircle, Activity, TrendingUp } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { EmptyState } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { resolveViewer, resolveAuthenticatedViewer } from '@/server/auth/resolve-viewer';
import { resolveAuthMode } from '@/lib/supabase/env';
import { getMonitorRepository } from '@/server/pricing/monitor';
import type { MonitorTargetView, MonitorRunView, MonitoringSummary } from '@/server/pricing/monitor';
import { RunNowButton, TargetToggleButton, CadenceForm } from './_components/monitor-controls';

export const dynamic = 'force-dynamic';

const MUTATION_ROLES = ['management', 'internal'];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function targetStatusBadge(t: MonitorTargetView) {
  if (!t.enabled) return <Badge variant="outline">Pausada</Badge>;
  if (t.hasFailureAlert) return <Badge variant="destructive">Error ({t.consecutiveFailures} fallos)</Badge>;
  if (t.isOverdue) return <Badge variant="warning">Vencida</Badge>;
  return <Badge variant="success">Activa</Badge>;
}

function runStatusBadge(r: MonitorRunView) {
  const map: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
    completed: { label: 'Completada', variant: 'success' },
    partial: { label: 'Parcial', variant: 'warning' },
    failed: { label: 'Fallida', variant: 'destructive' },
    running: { label: 'En curso', variant: 'secondary' },
  };
  const cfg = map[r.status] ?? { label: r.status, variant: 'secondary' as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: 'alert' | 'warn';
}) {
  const toneClass =
    tone === 'alert' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-iconic-ink';
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

export default async function MonitoringCenterPage() {
  let viewerRole = 'consulta';
  let targets: MonitorTargetView[] = [];
  let runs: MonitorRunView[] = [];
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

    [targets, runs, summary] = await Promise.all([
      repo.listTargets(viewer),
      repo.listRecentRuns(viewer, 5),
      repo.getMonitoringSummary(viewer),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Error al cargar el monitoreo';
  }

  const canMutate = MUTATION_ROLES.includes(viewerRole);

  if (error) {
    return (
      <div>
        <PageHeader title="Monitoreo de precios" />
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Monitoreo de precios"
        description="Agente automático: revisa fuentes públicas habilitadas y propone observaciones pendientes. Nunca aprueba automáticamente."
        breadcrumb={
          <Link href="/catalog" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Catálogo
          </Link>
        }
      />

      {/* Resumen */}
      {summary && (
        <section aria-label="Resumen de monitoreo" className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <SummaryCard label="Fuentes monitoreadas" value={summary.monitoredCount} icon={<Radar className="h-4 w-4" aria-hidden="true" />} />
          <SummaryCard label="Activas" value={summary.activeCount} icon={<Activity className="h-4 w-4" aria-hidden="true" />} />
          <SummaryCard label="Pausadas" value={summary.pausedCount} icon={<PauseCircle className="h-4 w-4" aria-hidden="true" />} />
          <SummaryCard label="Vencidas" value={summary.overdueCount} icon={<Clock className="h-4 w-4" aria-hidden="true" />} tone={summary.overdueCount > 0 ? 'warn' : undefined} />
          <SummaryCard label="Cambios pendientes" value={summary.pendingChangesCount} icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />} tone={summary.pendingChangesCount > 0 ? 'warn' : undefined} />
          <SummaryCard label="Con error" value={summary.erroredCount} icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} tone={summary.erroredCount > 0 ? 'alert' : undefined} />
        </section>
      )}

      {/* Última ejecución + acción manual */}
      <section aria-label="Ejecución" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="text-sm text-gray-600">
          Última ejecución:{' '}
          <span className="font-medium text-iconic-ink">{formatDate(summary?.lastRunAt ?? null)}</span>
          <span className="ml-2 text-xs text-gray-400">Cron diario 06:00 (hora Colombia)</span>
        </div>
        {canMutate && <RunNowButton />}
      </section>

      {/* Tabla de fuentes */}
      <section aria-label="Fuentes monitoreadas" className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Fuentes ({targets.length})</h2>
        {targets.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="Sin fuentes monitoreadas"
            description="Habilita «Monitorear esta fuente» desde la inteligencia de precios de un recurso del catálogo."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium text-gray-500">
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
                {targets.map((t) => (
                  <tr key={t.id} className="border-b border-gray-100 last:border-0">
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
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(t.lastCheckedAt)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{formatDate(t.nextCheckAt)}</td>
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
      </section>

      {/* Corridas recientes */}
      <section aria-label="Corridas recientes">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">Corridas recientes</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay corridas del monitor.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm shadow-sm">
                {runStatusBadge(r)}
                <span className="text-xs text-gray-500">
                  {r.triggerType === 'scheduled' ? 'Programada' : 'Manual'} · {formatDate(r.startedAt)}
                </span>
                <span className="text-xs text-gray-500">
                  Revisados {r.counters.checked ?? 0} · Sin cambio {r.counters.unchanged ?? 0} · Cambios{' '}
                  {(r.counters.pendingCreated ?? 0) + (r.counters.changed ?? 0)} · Errores {r.counters.failed ?? 0}
                </span>
                {r.errorSummary && <span className="text-xs text-red-600">{r.errorSummary}</span>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
