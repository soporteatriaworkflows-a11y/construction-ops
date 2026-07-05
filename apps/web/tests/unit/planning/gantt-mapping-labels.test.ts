/**
 * gantt-mapping-labels.test.ts — Labels inteligentes del Gantt (P2B1).
 *
 * La barra lleva la etiqueta CORTA (`wbsCode` o fallback truncado) como `name`
 * de frappe; el nombre completo viaja en `fullName` para popup/panel. Sin DOM.
 */
import { describe, expect, it } from 'vitest';
import type { ScheduleTaskView } from '@/lib/contracts/read-model';
import { fullGanttLabel, shortGanttLabel, toGanttTask } from '@/modules/planning';

function taskFixture(overrides: Partial<ScheduleTaskView> = {}): ScheduleTaskView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    wbsCode: '3.2',
    name: 'Mampostería muros primer piso ala norte',
    plannedStart: '2026-07-01',
    plannedEnd: '2026-07-15',
    plannedDurationDays: '15',
    progressPct: '40',
    status: 'in_progress',
    isMilestone: false,
    sortOrder: 1,
    ...overrides,
  } as ScheduleTaskView;
}

describe('shortGanttLabel', () => {
  it('usa wbsCode cuando existe', () => {
    expect(shortGanttLabel(taskFixture())).toBe('3.2');
  });

  it('sin wbsCode (vacío o placeholder —) cae al nombre truncado seguro', () => {
    const label = shortGanttLabel(taskFixture({ wbsCode: '' }));
    expect(label.length).toBeLessThanOrEqual(14);
    expect(label.endsWith('…')).toBe(true);
    expect(shortGanttLabel(taskFixture({ wbsCode: '—', name: 'Hito entrega' }))).toBe(
      'Hito entrega',
    );
  });

  it('nunca devuelve cadena vacía', () => {
    expect(shortGanttLabel(taskFixture({ wbsCode: ' ', name: '  ' }))).not.toBe('');
  });
});

describe('fullGanttLabel', () => {
  it('compone "WBS · nombre" cuando hay código', () => {
    expect(fullGanttLabel(taskFixture())).toBe(
      '3.2 · Mampostería muros primer piso ala norte',
    );
  });

  it('sin código devuelve solo el nombre', () => {
    expect(fullGanttLabel(taskFixture({ wbsCode: '' }))).toBe(
      'Mampostería muros primer piso ala norte',
    );
  });
});

describe('toGanttTask (P2B1)', () => {
  it('name es la etiqueta corta y fullName conserva el nombre completo', () => {
    const bar = toGanttTask(taskFixture(), [], new Set());
    expect(bar.name).toBe('3.2');
    expect(bar.fullName).toBe('3.2 · Mampostería muros primer piso ala norte');
  });

  it('conserva id/fechas/avance/dependencias/custom_class como antes', () => {
    const bar = toGanttTask(
      taskFixture(),
      ['22222222-2222-4222-8222-222222222222'],
      new Set(['11111111-1111-4111-8111-111111111111']),
    );
    expect(bar.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(bar.start).toBe('2026-07-01');
    expect(bar.end).toBe('2026-07-15');
    expect(bar.progress).toBe(40);
    expect(bar.dependencies).toBe('22222222-2222-4222-8222-222222222222');
    expect(bar.custom_class).toBe('gbar--status-in_progress--critical');
  });
});
