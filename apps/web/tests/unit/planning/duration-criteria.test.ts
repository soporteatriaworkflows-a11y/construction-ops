/**
 * duration-criteria.test.ts — Criterio de duración por categoría (P2C4a).
 *
 * Módulo PURO: clasificación por keywords, evaluación low/ok/high, copy y
 * reporte global. Sin DB/DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  DURATION_CATEGORIES,
  buildScheduleDurationReport,
  classifyActivityDurationCategory,
  evaluateActivityDuration,
  getDurationWarningCopy,
  type DurationReportTask,
} from '@/modules/planning';

function reportTask(overrides: Partial<DurationReportTask> = {}): DurationReportTask {
  return {
    id: 't1',
    name: 'Excavación manual',
    chapterName: null,
    taskType: 'activity',
    isMilestone: false,
    plannedDurationDays: '7',
    plannedStart: '2026-07-01',
    plannedEnd: '2026-07-07',
    ...overrides,
  };
}

describe('classifyActivityDurationCategory', () => {
  it('clasifica por nombre (sin sensibilidad a acentos/mayúsculas)', () => {
    expect(classifyActivityDurationCategory('EXCAVACIÓN MANUAL')?.key).toBe('excavacion');
    expect(classifyActivityDurationCategory('Mampostería muros piso 1')?.key).toBe('mamposteria');
    expect(classifyActivityDurationCategory('Pañete interior')?.key).toBe('acabados');
    expect(classifyActivityDurationCategory('Pintura vinilo 3 manos')?.key).toBe('pintura');
  });

  it('el orden de la tabla evita falsos cruces (cimentación antes que estructura)', () => {
    expect(classifyActivityDurationCategory('Viga de amarre cimentación')?.key).toBe('cimentacion');
    expect(classifyActivityDurationCategory('Viga aérea eje B')?.key).toBe('estructura');
    expect(classifyActivityDurationCategory('Muro estructural pantalla')?.key).toBe('estructura');
  });

  it('usa el capítulo como respaldo cuando el nombre no clasifica', () => {
    expect(
      classifyActivityDurationCategory('Punto doble salida', 'INSTALACIONES ELÉCTRICAS')?.key,
    ).toBe('electricas');
  });

  it('sin coincidencia devuelve null (conservador, sin falsos positivos)', () => {
    expect(classifyActivityDurationCategory('Gestión administrativa')).toBeNull();
    expect(classifyActivityDurationCategory('')).toBeNull();
  });

  it('todas las categorías tienen rangos coherentes min <= typical <= max', () => {
    for (const c of DURATION_CATEGORIES) {
      expect(c.minDays).toBeGreaterThanOrEqual(1);
      expect(c.typicalDays).toBeGreaterThanOrEqual(c.minDays);
      expect(c.maxDays).toBeGreaterThanOrEqual(c.typicalDays);
    }
  });
});

describe('evaluateActivityDuration', () => {
  const excavacion = classifyActivityDurationCategory('Excavación');

  it('baja / ok / alta según el rango de la categoría', () => {
    expect(evaluateActivityDuration(1, excavacion)).toBe('low');
    expect(evaluateActivityDuration(7, excavacion)).toBe('ok');
    expect(evaluateActivityDuration(379, excavacion)).toBe('high');
  });

  it('en los bordes del rango es ok (inclusivo)', () => {
    expect(evaluateActivityDuration(excavacion!.minDays, excavacion)).toBe('ok');
    expect(evaluateActivityDuration(excavacion!.maxDays, excavacion)).toBe('ok');
  });

  it('sin categoría o duración inválida devuelve null', () => {
    expect(evaluateActivityDuration(10, null)).toBeNull();
    expect(evaluateActivityDuration(Number.NaN, excavacion)).toBeNull();
    expect(evaluateActivityDuration(0, excavacion)).toBeNull();
    expect(evaluateActivityDuration(-5, excavacion)).toBeNull();
  });
});

describe('getDurationWarningCopy', () => {
  const excavacion = classifyActivityDurationCategory('Excavación')!;

  it('alta y baja llevan el copy aprobado y el llamado a revisar', () => {
    const high = getDurationWarningCopy('high', excavacion);
    expect(high).toContain('Duración inusualmente alta');
    expect(high).toContain('Revisar antes de publicar');
    const low = getDurationWarningCopy('low', excavacion);
    expect(low).toContain('Duración inusualmente baja');
    expect(low).toContain('Revisar antes de publicar');
  });

  it('ok no genera copy', () => {
    expect(getDurationWarningCopy('ok', excavacion)).toBeNull();
  });
});

describe('buildScheduleDurationReport', () => {
  it('cuenta altas/bajas, arma items y calcula totalDays inclusivo', () => {
    const report = buildScheduleDurationReport([
      reportTask({ id: 'a', name: 'Excavación', plannedDurationDays: '379', plannedStart: '2026-01-01', plannedEnd: '2027-01-14' }),
      reportTask({ id: 'b', name: 'Pintura general', plannedDurationDays: '1', plannedStart: '2026-01-01', plannedEnd: '2026-01-01' }),
      reportTask({ id: 'c', name: 'Mampostería', plannedDurationDays: '20', plannedStart: '2026-01-05', plannedEnd: '2026-01-24' }),
    ]);
    // 2026-01-01 → 2027-01-14 inclusivo = 379 días.
    expect(report.totalDays).toBe(379);
    expect(report.outOfRangeCount).toBe(2);
    expect(report.highCount).toBe(1);
    expect(report.lowCount).toBe(1);
    expect(report.items.map((i) => i.taskId).sort()).toEqual(['a', 'b']);
    expect(report.items.find((i) => i.taskId === 'a')?.verdict).toBe('high');
    expect(report.items.find((i) => i.taskId === 'b')?.verdict).toBe('low');
  });

  it('ignora capítulos, hitos y actividades sin clasificar', () => {
    const report = buildScheduleDurationReport([
      reportTask({ id: 'ch', name: 'Excavación', taskType: 'chapter', plannedDurationDays: '999' }),
      reportTask({ id: 'mi', name: 'Excavación', isMilestone: true, plannedDurationDays: '999' }),
      reportTask({ id: 'nc', name: 'Gestión administrativa', plannedDurationDays: '999' }),
    ]);
    expect(report.outOfRangeCount).toBe(0);
    expect(report.items).toEqual([]);
  });

  it('sin tareas o sin fechas válidas: totalDays 0 y sin items', () => {
    expect(buildScheduleDurationReport([]).totalDays).toBe(0);
    const report = buildScheduleDurationReport([
      reportTask({ plannedStart: 'invalida', plannedEnd: 'tampoco', plannedDurationDays: '7' }),
    ]);
    expect(report.totalDays).toBe(0);
    // La actividad sigue evaluándose por duración aunque sus fechas no sumen al total.
    expect(report.outOfRangeCount).toBe(0);
  });
});
