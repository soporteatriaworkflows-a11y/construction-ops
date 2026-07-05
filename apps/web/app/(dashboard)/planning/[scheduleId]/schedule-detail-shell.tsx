/**
 * schedule-detail-shell.tsx — Shell maestro-detalle del detalle de cronograma
 * (SCHEDULE_WORKSPACE_UX_V2). SOLO presentación.
 *
 * Componente CLIENTE: organiza el detalle en pestañas (Tareas maestro-detalle,
 * Gantt, Trazabilidad, Edición) para reemplazar la página vertical infinita. El
 * Gantt y la edición se montan SOLO al abrir su pestaña. Recibe nodos ya
 * renderizados por el servidor (Gantt/Trazabilidad/Edición) sin modificarlos.
 */
'use client';

import { useState, type MouseEvent, type ReactNode } from 'react';
import { ScheduleWorkspace } from './schedule-workspace';
import { TaskDetailPanel } from './task-detail-panel';
import { GanttDurationForm } from './gantt-duration-form';
import type { WorkspaceTask } from './schedule-workspace-filter';

type Tab = 'tasks' | 'gantt' | 'trace' | 'edit';

interface Props {
  /** Id del cronograma (P2B3: destino de `updateTaskAction` desde el panel). */
  scheduleId: string;
  tasks: WorkspaceTask[];
  canSeeCriticalPath: boolean;
  warningCount: number;
  gantt: ReactNode;
  trace: ReactNode;
  clientSafe?: boolean;
  /**
   * P2B3: habilita editar la DURACIÓN desde el panel del Gantt. La page lo
   * deriva del gate ESTRUCTURAL existente (`canManage` = admin/gerencia/
   * presupuestos) y excluye cronogramas archivados. El servidor re-valida.
   */
  canEditDuration?: boolean;
  /** Panel de edición existente (intacto). `null` si el rol no puede gestionar. */
  edit: ReactNode | null;
}

export function ScheduleDetailShell({ scheduleId, tasks, canSeeCriticalPath, warningCount, gantt, trace, edit, clientSafe = false, canEditDuration = false }: Props) {
  const [tab, setTab] = useState<Tab>('tasks');
  // P2B2: tarea seleccionada desde una barra del Gantt (panel lateral).
  const [ganttTaskId, setGanttTaskId] = useState<string | null>(null);
  const ganttSelected = ganttTaskId
    ? (tasks.find((t) => t.id === ganttTaskId) ?? null)
    : null;

  // Delegación de click sobre el Gantt: frappe-gantt@1.2.2 no expone `on_click`,
  // pero renderiza cada barra como `.bar-wrapper` con `data-id` = id de la
  // tarea (UUID, que frappe conserva intacto). Si la librería cambiara su DOM
  // interno o el click no cae en una barra, simplemente no se selecciona nada.
  const handleGanttClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    const bar = target?.closest?.('.bar-wrapper');
    const taskId = bar?.getAttribute('data-id');
    if (taskId && tasks.some((t) => t.id === taskId)) setGanttTaskId(taskId);
  };

  const tabs: { id: Tab; label: string; badge?: number; show: boolean }[] = [
    { id: 'tasks', label: 'Tareas', show: true },
    { id: 'gantt', label: 'Gantt', show: true },
    { id: 'trace', label: 'Trazabilidad', badge: warningCount || undefined, show: true },
    { id: 'edit', label: 'Edición', show: edit !== null },
  ];

  return (
    <div>
      <div role="tablist" aria-label="Vistas del cronograma" className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.filter((t) => t.show).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
                active ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">{t.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tareas: maestro-detalle. Siempre montado para conservar filtros/selección. */}
      <div hidden={tab !== 'tasks'}>
        <ScheduleWorkspace
          tasks={tasks}
          canSeeCriticalPath={canSeeCriticalPath}
          clientSafe={clientSafe}
          onRequestEdit={edit !== null ? () => setTab('edit') : undefined}
        />
      </div>

      {/* Gantt: se monta solo al abrir la pestaña (evita carga pesada por defecto).
          P2B2: Gantt a la izquierda + panel de la actividad seleccionada a la
          derecha (debajo en pantallas angostas). Panel SOLO lectura aquí. */}
      {tab === 'gantt' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* P2C1: sin overflow propio — la caja de scroll vive DENTRO del
              GanttChart (container_height de frappe); controles y leyenda
              quedan fuera del área scrolleable. */}
          <div className="min-w-0" onClick={handleGanttClick}>
            {gantt}
          </div>
          <aside className="lg:sticky lg:top-4 lg:self-start space-y-4" aria-label="Detalle de la actividad seleccionada">
            <TaskDetailPanel
              task={ganttSelected}
              canSeeCriticalPath={canSeeCriticalPath}
              clientSafe={clientSafe}
              emptyTitle="Selecciona una actividad del Gantt"
              emptyHint="para ver su detalle."
            />
            {/* P2B3: solo gate estructural; capitulos e hitos no tienen duracion editable. */}
            {canEditDuration && ganttSelected && ganttSelected.taskType !== 'chapter' && !ganttSelected.isMilestone && (
              <GanttDurationForm key={ganttSelected.id} scheduleId={scheduleId} task={ganttSelected} />
            )}
          </aside>
        </div>
      )}

      {tab === 'trace' && <div>{trace}</div>}

      {edit !== null && (
        <div hidden={tab !== 'edit'} id="editar-cronograma">
          {edit}
        </div>
      )}
    </div>
  );
}
