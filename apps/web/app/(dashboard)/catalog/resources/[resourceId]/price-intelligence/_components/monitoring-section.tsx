/**
 * monitoring-section.tsx — Sección «Monitoreo automático» del recurso (Fase 4A).
 * Server-presentational (sin fetch propio): recibe targets/resultados ya
 * resueltos por la página. Propiedad: agent-frontend-boq / agent-pricing.
 */
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  EnableMonitoringForm,
  TargetToggleButton,
  CadenceForm,
  RunNowButton,
} from '@/app/(dashboard)/catalog/monitoring/_components/monitor-controls';
import type { MonitorTargetView, MonitorResultView } from '@/server/pricing/monitor';

const RESULT_LABEL: Record<string, string> = {
  unchanged: 'Sin cambio',
  changed: 'Cambio (pending existente)',
  pending_created: 'Cambio → pending creada',
  unreachable: 'Inaccesible',
  blocked: 'Bloqueada por el sitio',
  parse_failed: 'Sin precio extraíble',
  invalid_response: 'Respuesta inválida',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

function targetStatus(t: MonitorTargetView) {
  if (!t.enabled) return <Badge variant="outline">Pausada</Badge>;
  if (t.hasFailureAlert) return <Badge variant="destructive">Error ({t.consecutiveFailures} fallos)</Badge>;
  if (t.isOverdue) return <Badge variant="warning">Vencida</Badge>;
  return <Badge variant="success">Activa</Badge>;
}

export function MonitoringSection({
  resourceId,
  targets,
  resultsByTarget,
  canMutate,
}: {
  resourceId: string;
  targets: MonitorTargetView[];
  resultsByTarget: Record<string, MonitorResultView[]>;
  canMutate: boolean;
}) {
  return (
    <section aria-label="Monitoreo automático" className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Monitoreo automático</h2>
        <Link href="/catalog/monitoring" className="text-xs text-iconic-primary hover:underline">
          Centro de monitoreo →
        </Link>
      </div>

      <div className="space-y-4">
        {targets.map((t) => {
          const results = resultsByTarget[t.id] ?? [];
          return (
            <div key={t.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                {targetStatus(t)}
                <span className="max-w-[320px] truncate text-xs text-gray-500" title={t.sourceUrl}>
                  {t.sourceUrl}
                </span>
                {t.supplierName && <span className="text-xs text-gray-400">· {t.supplierName}</span>}
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600 md:grid-cols-4">
                <div>
                  <dt className="text-gray-400">Última revisión</dt>
                  <dd>{formatDate(t.lastCheckedAt)}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Próxima revisión</dt>
                  <dd>{formatDate(t.nextCheckAt)}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Frecuencia</dt>
                  <dd>
                    {canMutate ? (
                      <CadenceForm targetId={t.id} cadenceDays={t.cadenceDays} resourceId={resourceId} />
                    ) : (
                      `${t.cadenceDays} días`
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Fallos consecutivos</dt>
                  <dd className={t.consecutiveFailures > 0 ? 'text-red-600' : ''}>{t.consecutiveFailures}</dd>
                </div>
              </dl>

              {canMutate && (
                <div className="mt-3 flex items-center gap-2">
                  {t.enabled && <RunNowButton targetId={t.id} resourceId={resourceId} />}
                  <TargetToggleButton targetId={t.id} enabled={t.enabled} resourceId={resourceId} />
                </div>
              )}

              {results.length > 0 && (
                <div className="mt-3 border-t border-gray-100 pt-2">
                  <p className="mb-1 text-xs font-medium text-gray-500">Historial reciente</p>
                  <ul className="space-y-1">
                    {results.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="text-gray-400">{formatDate(r.checkedAt)}</span>
                        <span>{RESULT_LABEL[r.status] ?? r.status}</span>
                        {r.warnings.length > 0 && (
                          <span className="text-amber-700" title={r.warnings.join(' · ')}>
                            ({r.warnings.length} advertencia{r.warnings.length > 1 ? 's' : ''})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}

        {canMutate ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
            <p className="mb-3 text-xs text-gray-600">
              El agente del sistema revisará la fuente según la frecuencia elegida y creará
              observaciones <strong>pendientes</strong> cuando detecte cambios. Nunca aprueba
              automáticamente ni modifica presupuestos.
            </p>
            <EnableMonitoringForm resourceId={resourceId} />
          </div>
        ) : (
          targets.length === 0 && (
            <p className="text-xs text-gray-500">
              No hay fuentes monitoreadas para este recurso.
            </p>
          )
        )}
      </div>
    </section>
  );
}
