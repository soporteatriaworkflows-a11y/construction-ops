/**
 * task-detail-panel.tsx — Panel de detalle de una tarea del cronograma (P2B2).
 *
 * EXTRACCIÓN del `TaskDetailPanel` local de `schedule-workspace.tsx` (V2) para
 * reutilizarlo también en la pestaña Gantt (selección de barra). SOLO
 * presentación; mismo contenido visual/semántico que en la pestaña Tareas.
 *
 * Client-safe (P1): con `clientSafe` se ocultan cuadrilla, cantidad técnica,
 * rendimiento, vínculos BOQ/APU y advertencias de rendimiento; se conservan
 * código, nombre, capítulo, fechas, duración, responsable, estado y avance.
 */
'use client';

import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScheduleStatusBadge } from '@/components/planning/schedule-status-badge';
import { formatDate, formatNumber } from '@/lib/utils/format';
import { isDelayed, type WorkspaceTask } from './schedule-workspace-filter';

interface Props {
  task: WorkspaceTask | null;
  canSeeCriticalPath: boolean;
  clientSafe: boolean;
  /** Solicita editar la tarea (la shell cambia a la pestaña de edición). */
  onRequestEdit?: (taskId: string) => void;
  /** Título del empty state (default: copy de la pestaña Tareas). */
  emptyTitle?: string;
  /** Segunda línea del empty state; si se omite, usa el hint por rol. */
  emptyHint?: string;
}

export function TaskDetailPanel({
  task,
  canSeeCriticalPath,
  clientSafe,
  onRequestEdit,
  emptyTitle = 'Selecciona una tarea',
  emptyHint,
}: Props) {
  if (!task) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <p className="text-sm font-medium text-gray-700">{emptyTitle}</p>
        <p className="mt-1 text-xs text-gray-500">
          {emptyHint ??
            (clientSafe
              ? 'para ver detalle, avance, fechas y responsable.'
              : 'para ver detalle, avance, duracion, responsable, rendimiento y vinculos BOQ/APU.')}
        </p>
      </div>
    );
  }
  const isActivity = task.taskType === 'activity';
  return (
    <div className="space-y-3 rounded-md border border-gray-200 bg-white p-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{task.wbsCode}</span>
          {task.isMilestone && <Badge variant="secondary">Hito</Badge>}
          {task.isCritical && <Badge variant="warning">Crítica</Badge>}
        </div>
        <h3 className="mt-1 text-base font-semibold text-gray-900">{task.name}</h3>
        {task.chapterName && <p className="text-xs text-gray-500">Capítulo: {task.chapterName}</p>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Field label="Inicio" value={formatDate(task.plannedStart)} />
        <Field label="Fin" value={formatDate(task.plannedEnd)} />
        <Field label="Duración" value={task.isMilestone ? '—' : `${formatNumber(task.plannedDurationDays, 0)} d`} />
        <Field label="Avance" value={`${formatNumber(task.progressPct, 0)}%`} />
        <div>
          <dt className="text-xs text-gray-500">Estado</dt>
          <dd className="mt-0.5"><ScheduleStatusBadge status={task.status} /></dd>
        </div>
        <Field label="Responsable" value={task.responsible ?? '—'} />
        {!clientSafe && (task.crewLabel || task.crewSize) && (
          <Field label="Cuadrilla" value={`${task.crewLabel ?? ''}${task.crewSize ? ` (${formatNumber(task.crewSize, 1)})` : ''}`.trim() || '—'} />
        )}
        {canSeeCriticalPath && task.totalFloatDays !== undefined && (
          <Field label="Holgura" value={`${formatNumber(task.totalFloatDays, 0)} d`} />
        )}
        {!clientSafe && isActivity && (task.quantitySnapshot || task.unitSnapshot) && (
          <Field label="Cantidad" value={`${task.quantitySnapshot ? Number(task.quantitySnapshot).toLocaleString('es-CO') : '—'} ${task.unitSnapshot ?? ''}`.trim()} />
        )}
      </dl>

      {!clientSafe && isActivity && (
        <div>
          <p className="text-xs text-gray-500">Rendimiento y vinculos</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <ProductivityTag source={task.productivitySource} />
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${task.boqItemId ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>BOQ {task.boqItemId ? '✓' : '—'}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${task.apuTemplateId ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>APU {task.apuTemplateId ? '✓' : '—'}</span>
          </div>
        </div>
      )}

      {/* Advertencias específicas de la tarea. */}
      {!clientSafe && task.productivitySource === 'manual' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ Sin APU vinculado: duración manual (mínima).</p>
      )}
      {!clientSafe && task.productivitySource === 'unknown' && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">⚠ APU sin rendimiento laboral usable: duración manual (mínima).</p>
      )}
      {isDelayed(task) && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">⚠ Avance por detrás de lo esperado a la fecha.</p>
      )}

      {onRequestEdit && task.taskType !== 'chapter' && (
        <button type="button" onClick={() => onRequestEdit(task.id)} className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Editar esta tarea
        </button>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-gray-800">{value}</dd>
    </div>
  );
}

function ProductivityTag({ source }: { source: string | null | undefined }) {
  if (source === 'apu') return <Badge variant="success">Rendimiento APU</Badge>;
  if (source === 'unknown') return <Badge variant="warning">Sin rendimiento</Badge>;
  if (source === 'manual') return <Badge variant="secondary">Manual (sin APU)</Badge>;
  return <span className="text-xs text-gray-400">—</span>;
}
