/**
 * gantt-zoom.test.ts — Helper puro de zoom/fit del Gantt (P2_GANTT_UX).
 *
 * Cubre: clamp de zoom, pasos acercar/alejar, ancho de columna por escala,
 * rango de días de las barras y cálculo de "Ajustar a ventana". Sin DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  GANTT_BASE_COLUMN_WIDTH,
  GANTT_DAYS_PER_COLUMN,
  GANTT_ZOOM_DEFAULT,
  GANTT_ZOOM_MAX,
  GANTT_ZOOM_MIN,
  clampGanttZoom,
  ganttColumnWidth,
  ganttFitZoom,
  ganttRangeDays,
  ganttZoomIn,
  ganttZoomOut,
} from '@/modules/planning';

describe('clampGanttZoom', () => {
  it('respeta los límites min/max', () => {
    expect(clampGanttZoom(0.01)).toBe(GANTT_ZOOM_MIN);
    expect(clampGanttZoom(99)).toBe(GANTT_ZOOM_MAX);
    expect(clampGanttZoom(1)).toBe(1);
  });

  it('valores no finitos o <= 0 caen al default', () => {
    expect(clampGanttZoom(Number.NaN)).toBe(GANTT_ZOOM_DEFAULT);
    expect(clampGanttZoom(Number.POSITIVE_INFINITY)).toBe(GANTT_ZOOM_DEFAULT);
    expect(clampGanttZoom(0)).toBe(GANTT_ZOOM_DEFAULT);
    expect(clampGanttZoom(-1)).toBe(GANTT_ZOOM_DEFAULT);
  });
});

describe('ganttZoomIn / ganttZoomOut', () => {
  it('acercar aumenta y alejar reduce', () => {
    expect(ganttZoomIn(1)).toBeGreaterThan(1);
    expect(ganttZoomOut(1)).toBeLessThan(1);
  });

  it('se detienen en los límites', () => {
    expect(ganttZoomIn(GANTT_ZOOM_MAX)).toBe(GANTT_ZOOM_MAX);
    expect(ganttZoomOut(GANTT_ZOOM_MIN)).toBe(GANTT_ZOOM_MIN);
  });

  it('ida y vuelta desde el default queda cerca del default', () => {
    const roundTrip = ganttZoomOut(ganttZoomIn(GANTT_ZOOM_DEFAULT));
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

  it('escala con el zoom y clampa el zoom fuera de rango', () => {
    expect(ganttColumnWidth('Week', 2)).toBe(GANTT_BASE_COLUMN_WIDTH.Week * 2);
    expect(ganttColumnWidth('Week', 99)).toBe(
      Math.round(GANTT_BASE_COLUMN_WIDTH.Week * GANTT_ZOOM_MAX),
    );
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
    for (const mode of ['Week', 'Month'] as const) {
      const zoom = ganttFitZoom(mode, rangeDays, containerWidth);
      if (zoom > GANTT_ZOOM_MIN && zoom < GANTT_ZOOM_MAX) {
        const columns = Math.ceil(
          (rangeDays + 130) / GANTT_DAYS_PER_COLUMN[mode], // margen generoso ≥ padding real
        );
        expect(ganttColumnWidth(mode, zoom) * columns).toBeLessThanOrEqual(
          containerWidth * 1.15,
        );
      }
    }
  });

  it('rangos muy largos clampan al zoom mínimo (legibilidad primero)', () => {
    expect(ganttFitZoom('Day', 3650, 800)).toBe(GANTT_ZOOM_MIN);
  });

  it('rangos muy cortos clampan al zoom máximo (no columnas gigantes)', () => {
    expect(ganttFitZoom('Month', 1, 10_000)).toBe(GANTT_ZOOM_MAX);
  });

  it('ancho de contenedor inválido cae al default', () => {
    expect(ganttFitZoom('Week', 60, 0)).toBe(GANTT_ZOOM_DEFAULT);
    expect(ganttFitZoom('Week', 60, Number.NaN)).toBe(GANTT_ZOOM_DEFAULT);
  });
});
