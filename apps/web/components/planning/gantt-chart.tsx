'use client';

/**
 * gantt-chart.tsx — Vista Gantt con `frappe-gantt` (Oleada 3B + P2_GANTT_UX).
 *
 * Propiedad: agent-planning. Componente CLIENTE: frappe-gantt manipula el DOM/SVG
 * directamente, por lo que el import de la librería + su CSS se hace dinámicamente
 * en el navegador (`useEffect`), nunca en SSR. El componente sólo recibe barras YA
 * mapeadas (`GanttTask[]`) por el dominio puro `modules/planning/gantt-mapping`:
 * CERO cálculo de cronograma aquí.
 *
 * P2_GANTT_UX: zoom (acercar/alejar/restablecer) + "Ajustar a ventana" (default)
 * + filas compactas + alto máximo con scroll controlado. El cálculo de anchos es
 * puro y vive en `modules/planning/gantt-zoom` (testeable sin DOM).
 *
 * Privacidad: el resaltado de ruta crítica llega embebido en `custom_class`
 * (`gantt-bar--critical`), que el mapeo del servidor SÓLO añade para roles
 * autorizados. Para `client` esa clase nunca está presente.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
// El CSS base de frappe-gantt está vendorizado al INICIO de `gantt-chart.css`
// (el `exports` de frappe-gantt@1.2.2 no expone el subpath `dist/*.css`). La
// librería JS (que manipula el DOM) se importa dinámicamente abajo.
import './gantt-chart.css';
import type { GanttTask, GanttZoomViewMode } from '@/modules/planning';
import {
  GANTT_ZOOM_DEFAULT,
  GANTT_ZOOM_MAX,
  GANTT_ZOOM_MIN,
  ganttColumnWidth,
  ganttFitZoom,
  ganttRangeDays,
  ganttZoomIn,
  ganttZoomOut,
} from '@/modules/planning';

/** Modos de vista expuestos al usuario. */
const VIEW_MODES = ['Day', 'Week', 'Month'] as const;
type ViewMode = (typeof VIEW_MODES)[number];

/** Ancho asumido mientras el contenedor aún no fue medido (SSR/primer frame). */
const FALLBACK_CONTAINER_WIDTH = 960;

interface GanttChartProps {
  tasks: readonly GanttTask[];
  /** Modo de vista inicial. */
  initialViewMode?: ViewMode;
}

export function GanttChart({ tasks, initialViewMode = 'Week' }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ganttRef = useRef<unknown>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  // `'fit'` = ajustar a ventana (default); número = zoom manual (1 = 100%).
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const headingId = useId();

  const rangeDays = useMemo(() => ganttRangeDays(tasks), [tasks]);
  const effectiveZoom =
    zoom === 'fit'
      ? ganttFitZoom(
          viewMode as GanttZoomViewMode,
          rangeDays,
          containerWidth ?? FALLBACK_CONTAINER_WIDTH,
        )
      : zoom;
  const columnWidth = ganttColumnWidth(viewMode as GanttZoomViewMode, effectiveZoom);

  // Mide el ancho visible del contenedor para "Ajustar a ventana" (incluye
  // recálculo al redimensionar; el umbral evita re-renders por ruido de px).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);
      if (width > 0) {
        setContainerWidth((prev) =>
          prev !== null && Math.abs(prev - width) < 8 ? prev : width,
        );
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Monta/actualiza el Gantt cuando cambian las barras, la escala o el zoom.
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
          language: 'es',
          column_width: columnWidth,
          // Filas compactas: barra 22px + padding 12px (frappe default: 30+18).
          bar_height: 22,
          padding: 12,
          upper_header_height: 36,
          lower_header_height: 26,
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
  }, [tasks, viewMode, columnWidth]);

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
        <div className="flex flex-wrap items-center gap-2">
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
          <div
            className="inline-flex items-center rounded-md border border-gray-200 bg-white p-0.5"
            role="group"
            aria-label="Zoom del Gantt"
          >
            <button
              type="button"
              onClick={() => setZoom(ganttZoomOut(effectiveZoom))}
              disabled={effectiveZoom <= GANTT_ZOOM_MIN}
              aria-label="Alejar"
              title="Alejar"
              className="rounded px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span
              className="min-w-11 px-1 text-center text-xs tabular-nums text-gray-600"
              aria-live="polite"
            >
              {Math.round(effectiveZoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom(ganttZoomIn(effectiveZoom))}
              disabled={effectiveZoom >= GANTT_ZOOM_MAX}
              aria-label="Acercar"
              title="Acercar"
              className="rounded px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom(GANTT_ZOOM_DEFAULT)}
              aria-pressed={zoom === GANTT_ZOOM_DEFAULT}
              title="Volver al zoom estándar (100%)"
              className={
                'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                (zoom === GANTT_ZOOM_DEFAULT
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100')
              }
            >
              Restablecer
            </button>
            <button
              type="button"
              onClick={() => setZoom('fit')}
              aria-pressed={zoom === 'fit'}
              title="Ajustar el cronograma al ancho visible"
              className={
                'rounded px-2.5 py-1 text-xs font-medium transition-colors ' +
                (zoom === 'fit'
                  ? 'bg-blue-700 text-white'
                  : 'text-gray-600 hover:bg-gray-100')
              }
            >
              Ajustar a ventana
            </button>
          </div>
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

      <div
        ref={scrollRef}
        className="max-h-[65vh] overflow-auto rounded-md border border-gray-200 bg-white"
      >
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
