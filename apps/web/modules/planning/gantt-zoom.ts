/**
 * gantt-zoom.ts — Zoom y "Ajustar a ventana" del Gantt (P2_GANTT_UX + P2B1).
 *
 * Propiedad: agent-planning. Lógica PURA (sin DOM/React): el componente
 * cliente `components/planning/gantt-chart.tsx` consume estas funciones para
 * traducir nivel de zoom + escala de tiempo a `column_width` de frappe-gantt,
 * y para calcular el zoom que hace caber el cronograma completo dentro del
 * ancho visible del contenedor.
 *
 * P2B1: el zoom mínimo es POR ESCALA (en Día el texto colapsa antes que en
 * Semana/Mes, así que Día conserva 0.5 y Semana/Mes bajan a 0.35), y
 * `pickDefaultViewMode` elige la escala inicial según el rango del cronograma.
 *
 * Privacidad: aquí SOLO se calculan anchos/niveles de zoom a partir de fechas
 * ya autorizadas por el mapeo del servidor. CERO datos internos por rol.
 */

import { isoDateToDayIndex } from './date';
import type { IsoDate } from './types';

/** Escalas de tiempo del Gantt que expone la UI. */
export type GanttZoomViewMode = 'Day' | 'Week' | 'Month';

/**
 * Zoom mínimo POR ESCALA (multiplicador sobre el ancho base). En Día las
 * etiquetas del encabezado colapsan por debajo de 0.5; Semana/Mes toleran
 * columnas más angostas y permiten alejarse más (decisión P2B1 aprobada).
 */
export const GANTT_ZOOM_MIN_BY_MODE: Record<GanttZoomViewMode, number> = {
  Day: 0.5,
  Week: 0.35,
  Month: 0.35,
};
/** Zoom máximo permitido (todas las escalas). */
export const GANTT_ZOOM_MAX = 2.5;
/** Factor multiplicativo de cada paso de acercar/alejar. */
export const GANTT_ZOOM_STEP = 1.25;
/** Zoom de "Restablecer" (100%). */
export const GANTT_ZOOM_DEFAULT = 1;

/**
 * Rango (días) por encima del cual la escala inicial pasa de Semana a Mes:
 * un cronograma de más de ~4 meses abre mejor en Mes (cabe completo en fit).
 */
export const GANTT_DEFAULT_MODE_WEEK_MAX_DAYS = 120;

/**
 * Ancho base (px) de una columna a zoom 1, por escala. Deliberadamente más
 * compacto que los defaults de frappe-gantt@1.2.2 (Day 45 / Week 140 /
 * Month 120) para que la vista inicial sea legible sin desbordar.
 */
export const GANTT_BASE_COLUMN_WIDTH: Record<GanttZoomViewMode, number> = {
  Day: 38,
  Week: 90,
  Month: 110,
};

/** Días (aprox.) que representa una columna en cada escala. */
export const GANTT_DAYS_PER_COLUMN: Record<GanttZoomViewMode, number> = {
  Day: 1,
  Week: 7,
  Month: 30.44,
};

/**
 * Padding temporal TOTAL en días (suma de ambos extremos) que frappe-gantt
 * agrega al rango según la escala: Day `7d`, Week `1m`, Month `2m` por lado.
 * Se incluye en el cálculo de "ajustar" para que el fit no se quede corto.
 */
const GANTT_PADDING_DAYS_TOTAL: Record<GanttZoomViewMode, number> = {
  Day: 14,
  Week: 61,
  Month: 122,
};

/** Altura del viewport del Gantt (px): límites de la caja de scroll (P2C1). */
export const GANTT_VIEWPORT_MIN_HEIGHT = 240;
export const GANTT_VIEWPORT_MAX_HEIGHT = 560;

/**
 * Alto (px) de la caja de scroll interna del Gantt (`container_height` de
 * frappe) según el número de barras. Aproxima el alto real del grid
 * (encabezados 36+26+10 + fila = barra 22 + padding 12) más margen para la
 * barra de scroll horizontal, y lo clampa para que: (a) cronogramas cortos no
 * dejen un vacío enorme, (b) cronogramas largos scrolleen DENTRO de la caja y
 * la barra horizontal quede siempre visible al borde inferior del viewport.
 */
export function ganttContainerHeight(taskCount: number): number {
  if (!Number.isFinite(taskCount) || taskCount <= 0) return GANTT_VIEWPORT_MIN_HEIGHT;
  const content = 72 + Math.round(taskCount) * 34 + 18;
  return Math.min(GANTT_VIEWPORT_MAX_HEIGHT, Math.max(GANTT_VIEWPORT_MIN_HEIGHT, content));
}

/**
 * Restringe `zoom` al rango permitido de la escala; valores no finitos o <= 0
 * caen al default.
 */
export function clampGanttZoom(zoom: number, mode: GanttZoomViewMode): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return GANTT_ZOOM_DEFAULT;
  return Math.min(GANTT_ZOOM_MAX, Math.max(GANTT_ZOOM_MIN_BY_MODE[mode], zoom));
}

/** Un paso de acercar (clampeado a la escala). */
export function ganttZoomIn(zoom: number, mode: GanttZoomViewMode): number {
  return round2(clampGanttZoom(clampGanttZoom(zoom, mode) * GANTT_ZOOM_STEP, mode));
}

/** Un paso de alejar (clampeado a la escala). */
export function ganttZoomOut(zoom: number, mode: GanttZoomViewMode): number {
  return round2(clampGanttZoom(clampGanttZoom(zoom, mode) / GANTT_ZOOM_STEP, mode));
}

/** Ancho de columna (px, entero >= 1) para una escala y un nivel de zoom. */
export function ganttColumnWidth(mode: GanttZoomViewMode, zoom: number): number {
  return Math.max(1, Math.round(GANTT_BASE_COLUMN_WIDTH[mode] * clampGanttZoom(zoom, mode)));
}

/**
 * Escala inicial según el rango del cronograma: Semana hasta
 * `GANTT_DEFAULT_MODE_WEEK_MAX_DAYS` días; Mes para rangos mayores.
 * Rango 0/inválido (sin barras) ⇒ Semana.
 */
export function pickDefaultViewMode(rangeDays: number): GanttZoomViewMode {
  if (!Number.isFinite(rangeDays) || rangeDays <= 0) return 'Week';
  return rangeDays > GANTT_DEFAULT_MODE_WEEK_MAX_DAYS ? 'Month' : 'Week';
}

/**
 * Rango calendario inclusivo (días) que cubren las barras del Gantt.
 * Fechas inválidas se ignoran; sin fechas válidas devuelve 0.
 */
export function ganttRangeDays(
  tasks: ReadonlyArray<{ start: string; end: string }>,
): number {
  let minDay = Number.POSITIVE_INFINITY;
  let maxDay = Number.NEGATIVE_INFINITY;
  for (const task of tasks) {
    const start = tryDayIndex(task.start);
    const end = tryDayIndex(task.end);
    if (start === null || end === null || end < start) continue;
    if (start < minDay) minDay = start;
    if (end > maxDay) maxDay = end;
  }
  if (!Number.isFinite(minDay) || !Number.isFinite(maxDay)) return 0;
  return maxDay - minDay + 1;
}

/**
 * Zoom (clampeado al rango de la escala) que hace caber el cronograma
 * completo — rango + padding de frappe — en `containerWidth` px. Si el rango
 * es demasiado largo, el clamp inferior prima sobre el fit perfecto:
 * legibilidad antes que "todo en pantalla a cualquier costo".
 */
export function ganttFitZoom(
  mode: GanttZoomViewMode,
  rangeDays: number,
  containerWidth: number,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return GANTT_ZOOM_DEFAULT;
  }
  const totalDays = Math.max(rangeDays, 0) + GANTT_PADDING_DAYS_TOTAL[mode];
  const columns = Math.max(1, Math.ceil(totalDays / GANTT_DAYS_PER_COLUMN[mode]));
  return round2(
    clampGanttZoom(containerWidth / columns / GANTT_BASE_COLUMN_WIDTH[mode], mode),
  );
}

function tryDayIndex(value: string): number | null {
  try {
    return isoDateToDayIndex(value as IsoDate);
  } catch {
    return null;
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
