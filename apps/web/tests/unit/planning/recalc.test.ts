/**
 * recalc.test.ts — Recálculo de fechas del cronograma (SCHEDULE_FROM_BOQ_V1, Fase 5).
 * Propiedad: agent-orchestrator. Dominio PURO.
 */
import { describe, it, expect } from 'vitest';
import {
  recalculateScheduleDates,
  dependencyWouldCreateCycle,
  PlanningError,
  type RecalcTaskInput,
  type RecalcDependency,
} from '@/modules/planning';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';

function task(id: string, durationDays: number, isMilestone = false): RecalcTaskInput {
  return { id, durationDays, isMilestone };
}

describe('recalculateScheduleDates', () => {
  it('fin = inicio + duración - 1 (inclusivo) desde el inicio del cronograma', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 5)],
      dependencies: [],
    });
    expect(r.tasks[0]!.plannedStart).toBe('2026-07-01');
    expect(r.tasks[0]!.plannedEnd).toBe('2026-07-05');
    expect(r.scheduleEnd).toBe('2026-07-05');
  });

  it('dependencia FS recalcula el inicio de la sucesora (día siguiente al fin)', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 5), task(B, 3)],
      dependencies: [
        { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 0 },
      ],
    });
    const b = r.tasks.find((t) => t.id === B)!;
    // A: 07-01..07-05 ⇒ B inicia 07-06, dura 3 ⇒ 07-06..07-08
    expect(b.plannedStart).toBe('2026-07-06');
    expect(b.plannedEnd).toBe('2026-07-08');
  });

  it('lag_days desplaza la sucesora (FS + lag 2)', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 5), task(B, 3)],
      dependencies: [
        { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 2 },
      ],
    });
    const b = r.tasks.find((t) => t.id === B)!;
    // A termina 07-05 ⇒ B inicia 07-06 + 2 = 07-08
    expect(b.plannedStart).toBe('2026-07-08');
  });

  it('lag negativo adelanta la sucesora', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 5), task(B, 3)],
      dependencies: [
        { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: -2 },
      ],
    });
    const b = r.tasks.find((t) => t.id === B)!;
    // 07-06 - 2 = 07-04
    expect(b.plannedStart).toBe('2026-07-04');
  });

  it('SS alinea inicios + lag', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 5), task(B, 3)],
      dependencies: [
        { predecessorTaskId: A, successorTaskId: B, dependencyType: 'SS', lagDays: 1 },
      ],
    });
    const b = r.tasks.find((t) => t.id === B)!;
    expect(b.plannedStart).toBe('2026-07-02'); // 07-01 + 1
  });

  it('recalcula en cadena aguas abajo (A→B→C)', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 2), task(B, 2), task(C, 2)],
      dependencies: [
        { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 0 },
        { predecessorTaskId: B, successorTaskId: C, dependencyType: 'FS', lagDays: 0 },
      ],
    });
    const c = r.tasks.find((t) => t.id === C)!;
    // A 07-01..02, B 07-03..04, C 07-05..06
    expect(c.plannedStart).toBe('2026-07-05');
    expect(c.plannedEnd).toBe('2026-07-06');
    expect(r.scheduleEnd).toBe('2026-07-06');
  });

  it('toma el máximo de varias predecesoras', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 2), task(B, 8), task(C, 1)],
      dependencies: [
        { predecessorTaskId: A, successorTaskId: C, dependencyType: 'FS', lagDays: 0 },
        { predecessorTaskId: B, successorTaskId: C, dependencyType: 'FS', lagDays: 0 },
      ],
    });
    const c = r.tasks.find((t) => t.id === C)!;
    // B es la más larga (07-01..08) ⇒ C inicia 07-09
    expect(c.plannedStart).toBe('2026-07-09');
  });

  it('un hito tiene inicio = fin (duración 0)', () => {
    const r = recalculateScheduleDates({
      scheduleStart: '2026-07-01',
      tasks: [task(A, 3), task(B, 0, true)],
      dependencies: [
        { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 0 },
      ],
    });
    const b = r.tasks.find((t) => t.id === B)!;
    expect(b.plannedStart).toBe(b.plannedEnd);
    expect(b.plannedStart).toBe('2026-07-04');
  });

  it('rechaza ciclos', () => {
    expect(() =>
      recalculateScheduleDates({
        scheduleStart: '2026-07-01',
        tasks: [task(A, 2), task(B, 2)],
        dependencies: [
          { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 0 },
          { predecessorTaskId: B, successorTaskId: A, dependencyType: 'FS', lagDays: 0 },
        ],
      }),
    ).toThrow(PlanningError);
  });

  it('rechaza dependencia con tarea inexistente', () => {
    expect(() =>
      recalculateScheduleDates({
        scheduleStart: '2026-07-01',
        tasks: [task(A, 2)],
        dependencies: [
          { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 0 },
        ],
      }),
    ).toThrow(PlanningError);
  });
});

describe('dependencyWouldCreateCycle', () => {
  it('detecta self-loop', () => {
    expect(dependencyWouldCreateCycle([], A, A)).toBe(true);
  });

  it('detecta ciclo indirecto (A→B existe; agregar B→A cierra)', () => {
    const existing: RecalcDependency[] = [
      { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 0 },
    ];
    expect(dependencyWouldCreateCycle(existing, B, A)).toBe(true);
  });

  it('permite dependencia que no crea ciclo', () => {
    const existing: RecalcDependency[] = [
      { predecessorTaskId: A, successorTaskId: B, dependencyType: 'FS', lagDays: 0 },
    ];
    expect(dependencyWouldCreateCycle(existing, B, C)).toBe(false);
  });
});
