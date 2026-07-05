/**
 * gantt-zoom.test.ts — Helper puro de zoom/fit del Gantt (P2_GANTT_UX + P2B1).
 *
 * Cubre: clamp de zoom POR ESCALA, pasos acercar/alejar, ancho de columna por
 * escala, escala default por rango, rango de días de las barras y cálculo de
 * "Ajustar a ventana". Sin DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  GANTT_BASE_COLUMN_WIDTH,
  GANTT_DAYS_PER_COLUMN,
  GANTT_DEFAULT_MODE_WEEK_MAX_DAYS,
  GANTT_ZOOM_DEFAULT,
  GANTT_ZOOM_MAX,
  GANTT_ZOOM_MIN_BY_MODE,
  GANTT_VIEWPORT_MIN_HEIGHT,
  GANTT_VIEWPORT_MAX_HEIGHT,
  clampGanttZoom,
  ganttContainerHeight,
  ganttColumnWidth,
  ganttFitZoom,
  ganttRangeDays,
  ganttZoomIn,
  ganttZoomOut,
  pickDefaultViewMode,
} from '@/modules/planning';

describe('clampGanttZoom (por escala)', () => {
  it('respeta el mínimo POR ESCALA (P2B1: Día 0.5, Semana/Mes 0.35)', () => {
    expect(GANTT_ZOOM_MIN_BY_MODE.Day).toBe(0.5);
    expect(GANTT_ZOOM_MIN_BY_MODE.Week).toBe(0.35);
    expect(GANTT_ZOOM_MIN_BY_MODE.Month).toBe(0.35);
    expect(clampGanttZoom(0.01, 'Day')).toBe(0.5);
    expect(clampGanttZoom(0.01, 'Week')).toBe(0.35);
    expect(clampGanttZoom(0.01, 'Month')).toBe(0.35);
    expect(clampGanttZoom(0.4, 'Week')).toBe(0.4);
    expect(clampGanttZoom(0.4, 'Day')).toBe(0.5);
  });

  it('respeta el máximo común', () => {
    expect(clampGanttZoom(99, 'Day')).toBe(GANTT_ZOOM_MAX);
    expect(clampGanttZoom(99, 'Week')).toBe(GANTT_ZOOM_MAX);
    expect(clampGanttZoom(1, 'Month')).toBe(1);
  });

  it('valores no finitos o <= 0 caen al default', () => {
    expect(clampGanttZoom(Number.NaN, 'Week')).toBe(GANTT_ZOOM_DEFAULT);
    expect(clampGanttZoom(Number.POSITIVE_INFINITY, 'Day')).toBe(GANTT_ZOOM_DEFAULT);
    expect(clampGanttZoom(0, 'Month')).toBe(GANTT_ZOOM_DEFAULT);
    expect(clampGanttZoom(-1, 'Week')).toBe(GANTT_ZOOM_DEFAULT);
  });
});

describe('ganttZoomIn / ganttZoomOut', () => {
  it('acercar aumenta y alejar reduce', () => {
    expect(ganttZoomIn(1, 'Week')).toBeGreaterThan(1);
    expect(ganttZoomOut(1, 'Week')).toBeLessThan(1);
  });

  it('se detienen en los límites de la escala', () => {
    expect(ganttZoomIn(GANTT_ZOOM_MAX, 'Day')).toBe(GANTT_ZOOM_MAX);
    expect(ganttZoomOut(GANTT_ZOOM_MIN_BY_MODE.Day, 'Day')).toBe(0.5);
    expect(ganttZoomOut(GANTT_ZOOM_MIN_BY_MODE.Week, 'Week')).toBe(0.35);
  });

  it('en Semana permite alejarse por debajo del mínimo de Día', () => {
    // Desde 0.5, un paso más de alejar en Semana baja a 0.4 (>= 0.35).
    const out = ganttZoomOut(0.5, 'Week');
    expect(out).toBeLessThan(0.5);
    expect(out).toBeGreaterThanOrEqual(GANTT_ZOOM_MIN_BY_MODE.Week);
  });

  it('ida y vuelta desde el default queda cerca del default', () => {
    const roundTrip = ganttZoomOut(ganttZoomIn(GANTT_ZOOM_DEFAULT, 'Month'), 'Month');
    expect(Math.abs(roundTrip - GANTT_ZOOM_DEFAULT)).toBeLessThan(0.02);
  });
});

describe('ganttColumnWidth', () => {
  it('a zoom 1 devuelve el ancho base compacto por escala', () => {
    expect(ganttColumnWidth('Day', 1)).toBe(GANTT_BASE_COLUMN_WIDTH.Day);
    expect(ganttColumnWidth('Week', 1)).toBe(GANTT_BASE_COLUMN_WIDTH.Week);
    expect(ganttColumnWidth('Month', 1)).toBe(GANTT_BASE_COLUMN_WIDTH.Month);
  });

  it('los anchos base son más compactos que los defaults de frappe-gantt', () => {
    // frappe-gantt@1.2.2: Day 45 (default global), Week 140, Month 120.
    expect(GANTT_BASE_COLUMN_WIDTH.Day).toBeLessThan(45);
    expect(GANTT_BASE_COLUMN_WIDTH.Week).toBeLessThan(140);
    expect(GANTT_BASE_COLUMN_WIDTH.Month).toBeLessThan(120);
  });

  it('escala con el zoom y clampa por escala', () => {
    expect(ganttColumnWidth('Week', 2)).toBe(GANTT_BASE_COLUMN_WIDTH.Week * 2);
    expect(ganttColumnWidth('Week', 99)).toBe(
      Math.round(GANTT_BASE_COLUMN_WIDTH.Week * GANTT_ZOOM_MAX),
    );
    // Zoom 0.35 en Semana YA es alcanzable (P2B1): 90 * 0.35 = 31.5 → 32.
    expect(ganttColumnWidth('Week', 0.35)).toBe(Math.round(90 * 0.35));
    // En Día 0.35 se clampa a 0.5: 38 * 0.5 = 19.
    expect(ganttColumnWidth('Day', 0.35)).toBe(19);
  });
});

describe('ganttContainerHeight', () => {
  it('clampa a los limites del viewport', () => {
    expect(GANTT_VIEWPORT_MIN_HEIGHT).toBe(240);
    expect(GANTT_VIEWPORT_MAX_HEIGHT).toBe(560);
    expect(ganttContainerHeight(0)).toBe(GANTT_VIEWPORT_MIN_HEIGHT);
    expect(ganttContainerHeight(1)).toBe(GANTT_VIEWPORT_MIN_HEIGHT);
    expect(ganttContainerHeight(500)).toBe(GANTT_VIEWPORT_MAX_HEIGHT);
  });

  it('crece con el numero de barras entre los limites', () => {
    // 10 barras: 72 + 340 + 18 = 430.
    expect(ganttContainerHeight(10)).toBe(430);
    expect(ganttContainerHeight(10)).toBeGreaterThan(ganttContainerHeight(5));
  });

  it('valores no finitos o negativos caen al minimo', () => {
    expect(ganttContainerHeight(Number.NaN)).toBe(GANTT_VIEWPORT_MIN_HEIGHT);
    expect(ganttContainerHeight(-3)).toBe(GANTT_VIEWPORT_MIN_HEIGHT);
  });
});

describe('pickDefaultViewMode', () => {
  it('Semana para rangos cortos, Mes para largos (umbral 120 días)', () => {
    expect(GANTT_DEFAULT_MODE_WEEK_MAX_DAYS).toBe(120);
    expect(pickDefaultViewMode(1)).toBe('Week');
    expect(pickDefaultViewMode(120)).toBe('Week');
    expect(pickDefaultViewMode(121)).toBe('Month');
    expect(pickDefaultViewMode(365)).toBe('Month');
  });

  it('rango 0/negativo/no finito cae a Semana', () => {
    expect(pickDefaultViewMode(0)).toBe('Week');
    expect(pickDefaultViewMode(-10)).toBe('Week');
    expect(pickDefaultViewMode(Number.NaN)).toBe('Week');
  });
});

describe('ganttRangeDays', () => {
  it('sin tareas o sin fechas válidas devuelve 0', () => {
    expect(ganttRangeDays([])).toBe(0);
    expect(ganttRangeDays([{ start: 'no-fecha', end: 'tampoco' }])).toBe(0);
  });

  it('una tarea de un día cuenta 1 día inclusivo', () => {
    expect(ganttRangeDays([{ start: '2026-07-01', end: '2026-07-01' }])).toBe(1);
  });

  it('toma el rango envolvente de varias tareas e ignora inválidas', () => {
    const tasks = [
      { start: '2026-07-10', end: '2026-07-20' },
      { start: '2026-07-01', end: '2026-07-05' },
      { start: 'invalida', end: '2026-09-01' },
      { start: '2026-08-01', end: '2026-08-15' },
    ];
    // 2026-07-01 → 2026-08-15 inclusivo = 46 días.
    expect(ganttRangeDays(tasks)).toBe(46);
  });
});

describe('ganttFitZoom', () => {
  it('el ancho resultante de las columnas cabe en el contenedor (sin tocar clamp)', () => {
    const containerWidth = 1200;
    const rangeDays = 180; // ~6 meses.
    // Espejo del padding TOTAL que frappe agrega por escala (constante privada
    // del helper): Week '1m' por lado ~ 61d; Month '2m' por lado ~ 122d.
    const paddingTotal = { Week: 61, Month: 122 } as const;
    for (const mode of ['Week', 'Month'] as const) {
      const zoom = ganttFitZoom(mode, rangeDays, containerWidth);
      if (zoom > GANTT_ZOOM_MIN_BY_MODE[mode] && zoom < GANTT_ZOOM_MAX) {
        const columns = Math.ceil(
          (rangeDays + paddingTotal[mode]) / GANTT_DAYS_PER_COLUMN[mode],
        );
        // Tolerancia 5% por redondeos (round2 del zoom + round del ancho).
        expect(ganttColumnWidth(mode, zoom) * columns).toBeLessThanOrEqual(
          containerWidth * 1.05,
        );
      }
    }
  });

  it('P2B1: el fit en Semana puede bajar a 0.35 (antes se cortaba en 0.5)', () => {
    // ~1 año en Semana con contenedor angosto: el fit ideal queda entre 0.35 y
    // 0.5 → ahora se usa; antes se clampaba a 0.5.
    const zoom = ganttFitZoom('Week', 365, 2200);
    expect(zoom).toBeLessThan(0.5);
    expect(zoom).toBeGreaterThanOrEqual(0.35);
  });

  it('rangos muy largos clampan al zoom mínimo DE LA ESCALA (legibilidad primero)', () => {
    expect(ganttFitZoom('Day', 3650, 800)).toBe(GANTT_ZOOM_MIN_BY_MODE.Day);
    expect(ganttFitZoom('Week', 36500, 800)).toBe(GANTT_ZOOM_MIN_BY_MODE.Week);
  });

  it('rangos muy cortos clampan al zoom máximo (no columnas gigantes)', () => {
    expect(ganttFitZoom('Month', 1, 10_000)).toBe(GANTT_ZOOM_MAX);
  });

  it('ancho de contenedor inválido cae al default', () => {
    expect(ganttFitZoom('Week', 60, 0)).toBe(GANTT_ZOOM_DEFAULT);
    expect(ganttFitZoom('Week', 60, Number.NaN)).toBe(GANTT_ZOOM_DEFAULT);
  });
});
