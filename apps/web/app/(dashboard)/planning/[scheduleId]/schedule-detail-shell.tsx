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

import { useState, type ReactNode } from 'react';
import { ScheduleWorkspace } from './schedule-workspace';
import type { WorkspaceTask } from './schedule-workspace-filter';

type Tab = 'tasks' | 'gantt' | 'trace' | 'edit';

interface Props {
  tasks: WorkspaceTask[];
  canSeeCriticalPath: boolean;
  warningCount: number;
  gantt: ReactNode;
  trace: ReactNode;
  /** Panel de edición existente (intacto). `null` si el rol no puede gestionar. */
  edit: ReactNode | null;
}

export function ScheduleDetailShell({ tasks, canSeeCriticalPath, warningCount, gantt, trace, edit }: Props) {
  const [tab, setTab] = useState<Tab>('tasks');

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
          onRequestEdit={edit !== null ? () => setTab('edit') : undefined}
        />
      </div>

      {/* Gantt: se monta solo al abrir la pestaña (evita carga pesada por defecto). */}
      {tab === 'gantt' && <div className="max-h-[70vh] overflow-auto">{gantt}</div>}

      {tab === 'trace' && <div>{trace}</div>}

      {edit !== null && (
        <div hidden={tab !== 'edit'} id="editar-cronograma">
          {edit}
        </div>
      )}
    </div>
  );
}
