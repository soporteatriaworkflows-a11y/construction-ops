'use client';

/**
 * gantt-chart.tsx — Vista Gantt con `frappe-gantt` (Oleada 3B).
 *
 * Propiedad: agent-planning. Componente CLIENTE: frappe-gantt manipula el DOM/SVG
 * directamente, por lo que el import de la librería + su CSS se hace dinámicamente
 * en el navegador (`useEffect`), nunca en SSR. El componente sólo recibe barras YA
 * mapeadas (`GanttTask[]`) por el dominio puro `modules/planning/gantt-mapping`:
 * CERO cálculo de cronograma aquí.
 *
 * Privacidad: el resaltado de ruta crítica llega embebido en `custom_class`
 * (`gantt-bar--critical`), que el mapeo del servidor SÓLO añade para roles
 * autorizados. Para `client` esa clase nunca está presente.
 */

import { useEffect, useId, useRef, useState } from 'react';
// El CSS base de frappe-gantt está vendorizado al INICIO de `gantt-chart.css`
// (el `exports` de frappe-gantt@1.2.2 no expone el subpath `dist/*.css`). La
// librería JS (que manipula el DOM) se importa dinámicamente abajo.
import './gantt-chart.css';
import type { GanttTask } from '@/modules/planning';

/** Modos de vista expuestos al usuario. */
const VIEW_MODES = ['Day', 'Week', 'Month'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

interface GanttChartProps {
  tasks: readonly GanttTask[];
  /** Modo de vista inicial. */
  initialViewMode?: ViewMode;
}

export function GanttChart({ tasks, initialViewMode = 'Week' }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<unknown>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const headingId = useId();

  // Monta/actualiza el Gantt cuando cambian las barras o el modo de vista.
  useEffect(() => {
    let cancelled = false;
    const el = containerRef.current;
    if (!el || tasks.length === 0) return;

    (async () => {
      try {
        const { default: Gantt } = await import('frappe-gantt');
        if (cancelled) return;

        // Limpia render previo (frappe escribe SVG dentro del contenedor).
        el.innerHTML = '';
        ganttRef.current = new Gantt(el, tasks as GanttTask[], {
          view_mode: viewMode,
          readonly: true,
          popup_on: 'click',
          infinite_padding: false,
          popup: ({ task }) =>
            `<div class="gantt-popup"><strong>${escapeHtml(task.name)}</strong>` +
            `<div>${escapeHtml(task.start)} → ${escapeHtml(task.end)}</div>` +
            `<div>Avance: ${task.progress ?? 0}%</div></div>`,
        });
        setReady(true);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'No se pudo cargar la vista Gantt.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tasks, viewMode]);

  if (tasks.length === 0) {
    return (
      <div
        className="rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-10 text-center text-sm text-gray-500"
        role="status"
      >
        No hay tareas con fechas para graficar.
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="text-sm font-semibold text-gray-900">
          Diagrama de Gantt
        </h3>
        <div
          className="inline-flex rounded-md border border-gray-200 bg-white p-0.5"
          role="group"
          aria-label="Escala de tiempo"
        >
          {VIEW_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={viewMode === mode}
              className={
                'rounded px-3 py-1 text-xs font-medium transition-colors ' +
                (viewMode === mode
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100')
              }
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        {/* frappe-gantt inyecta el SVG dentro de este contenedor. */}
        <div ref={containerRef} className="frappe-gantt-container" aria-hidden={!ready} />
      </div>

      <GanttLegend />
    </section>
  );
}

/** Leyenda de colores/estados del Gantt. */
function GanttLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600" aria-label="Leyenda">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" aria-hidden="true" />
        En progreso
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-green-600" aria-hidden="true" />
        Completada
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm bg-gray-400" aria-hidden="true" />
        Sin iniciar
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rotate-45 bg-purple-600" aria-hidden="true" />
        Hito
      </li>
    </ul>
  );
}

const MODE_LABELS: Record<ViewMode, string> = {
  Day: 'Día',
  Week: 'Semana',
  Month: 'Mes',
};

/** Escapa texto para inyectarlo de forma segura en el popup HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
