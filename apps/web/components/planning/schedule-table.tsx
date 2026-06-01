/**
 * schedule-table.tsx — Tabla del cronograma (WBS, fechas, avance, brecha).
 *
 * Propiedad: agent-planning. Server-safe (sin estado de cliente). Recibe filas
 * YA enriquecidas (`PlanningTaskRow`) por el dominio puro. Las columnas 🔒
 * (holgura/ruta crítica) SÓLO se renderizan cuando `canSeeCriticalPath` es
 * `true` (rol distinto de `client`); el read-model ya omite esos campos para
 * `client`, y la página no pasa `true` para ese rol.
 */

import { Milestone as MilestoneIcon } from 'lucide-react';
import { ScheduleStatusBadge } from './schedule-status-badge';
import type { PlanningTaskRow, ProgressVarianceStatus } from '@/modules/planning';
import { formatDate, formatNumber } from '@/lib/utils/format';

interface ScheduleTableProps {
  tasks: readonly PlanningTaskRow[];
  /** `true` ⇒ muestra columnas 🔒 (holgura/ruta crítica). Nunca para `client`. */
  canSeeCriticalPath: boolean;
}

/** Formatea un porcentaje en `DecimalString` (0..100) con 0–1 decimales. */
function pct(value: string): string {
  return `${formatNumber(value, 1)}%`;
}

const VARIANCE_STYLE: Record<ProgressVarianceStatus, string> = {
  ahead: 'text-green-700',
  on_track: 'text-gray-600',
  behind: 'text-red-700',
};

const VARIANCE_LABEL: Record<ProgressVarianceStatus, string> = {
  ahead: 'Adelantada',
  on_track: 'En tiempo',
  behind: 'Atrasada',
};

export function ScheduleTable({ tasks, canSeeCriticalPath }: ScheduleTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <caption className="sr-only">Tareas del cronograma</caption>
        <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
          <tr>
            <th scope="col" className="px-3 py-2">WBS</th>
            <th scope="col" className="px-3 py-2">Tarea</th>
            <th scope="col" className="px-3 py-2">Inicio</th>
            <th scope="col" className="px-3 py-2">Fin</th>
            <th scope="col" className="px-3 py-2 text-right">Dur. (d)</th>
            <th scope="col" className="px-3 py-2 text-right">Avance</th>
            <th scope="col" className="px-3 py-2 text-right">Esperado</th>
            <th scope="col" className="px-3 py-2 text-right">Brecha</th>
            <th scope="col" className="px-3 py-2">Estado</th>
            {canSeeCriticalPath && (
              <>
                <th scope="col" className="px-3 py-2 text-right">Holgura</th>
                <th scope="col" className="px-3 py-2">Crítica</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {tasks.map((t) => {
            const isChild = Boolean(t.parentTaskId);
            return (
              <tr key={t.id} className={t.isCritical ? 'bg-red-50/50' : undefined}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-gray-500">
                  {t.wbsCode}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={isChild ? 'flex items-center gap-1.5 pl-4' : 'flex items-center gap-1.5'}
                  >
                    {t.isMilestone && (
                      <MilestoneIcon
                        className="h-3.5 w-3.5 shrink-0 text-purple-600"
                        aria-label="Hito"
                      />
                    )}
                    <span className="font-medium text-gray-900">{t.name}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {formatDate(t.plannedStart)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                  {formatDate(t.plannedEnd)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                  {t.isMilestone ? '—' : formatNumber(t.plannedDurationDays, 0)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                  {pct(t.progressPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                  {pct(t.expectedProgressPct)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-medium ${VARIANCE_STYLE[t.varianceStatus]}`}>
                  <span title={VARIANCE_LABEL[t.varianceStatus]}>
                    {Number.parseFloat(t.progressVariancePct) > 0 ? '+' : ''}
                    {pct(t.progressVariancePct)}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <ScheduleStatusBadge status={t.status} />
                </td>
                {canSeeCriticalPath && (
                  <>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                      {t.totalFloatDays !== undefined
                        ? formatNumber(t.totalFloatDays, 0)
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {t.isCritical ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Crítica
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
