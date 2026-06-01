/**
 * planning-domain.test.ts — Dominio puro de planificación (Oleada 3B).
 * Propiedad: agent-planning.
 *
 * Cubre: ruta crítica de una cadena, detección de ciclos, holgura de una rama
 * paralela más corta, hitos, tipos de dependencia (FS/SS/FF/SF) y la proyección
 * por rol del view-model (privacidad: `client` no recibe ruta crítica).
 */
import { describe, it, expect } from 'vitest';
import {
  calculateCriticalPath,
  buildPlanningViewModel,
  PlanningError,
  type PlanningTask,
  type TaskDependency,
  type DependencyType,
} from '@/modules/planning';
import type {
  ScheduleSummary,
  ScheduleTaskView,
  DependencyView,
} from '@/lib/contracts/read-model';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const PROJ = '00000000-0000-4000-8000-000000000010';

function task(id: string, start: string, end: string, dur: string, opts: Partial<PlanningTask> = {}): PlanningTask {
  return {
    id,
    projectId: PROJ,
    projectScopeId: null,
    chapterId: null,
    parentTaskId: null,
    wbsCode: id,
    name: `Tarea ${id}`,
    description: null,
    plannedStart: start,
    plannedEnd: end,
    plannedDurationDays: dur,
    progressPct: '0',
    status: 'not_started',
    isMilestone: false,
    sortOrder: 0,
    externalReference: null,
    ...opts,
  } as PlanningTask;
}

function dep(pred: string, succ: string, type: DependencyType = 'FS', lag = '0'): TaskDependency {
  return { id: `${pred}-${succ}`, predecessorTaskId: pred, successorTaskId: succ, dependencyType: type, lagDays: lag };
}

describe('calculateCriticalPath — cadena lineal', () => {
  // Fechas CONSECUTIVAS (sin gap) ⇒ cadena A→B totalmente crítica (sin holgura).
  const A = task('A', '2026-03-02', '2026-03-06', '5');
  const B = task('B', '2026-03-07', '2026-03-11', '5');
  const result = calculateCriticalPath([A, B], [dep('A', 'B')]);

  it('la cadena consecutiva A→B es crítica (ambas)', () => {
    expect(result.criticalTaskIds).toContain('A');
    expect(result.criticalTaskIds).toContain('B');
  });

  it('proyecto: inicio = min start, fin = max end', () => {
    expect(result.projectStart).toBe('2026-03-02');
    expect(result.projectEnd).toBe('2026-03-11');
  });

  it('durationDays es un DecimalString positivo', () => {
    expect(typeof result.durationDays).toBe('string');
    expect(parseFloat(result.durationDays)).toBeGreaterThan(0);
  });
});

describe('detección de ciclos', () => {
  it('A→B y B→A lanza PlanningError', () => {
    const A = task('A', '2026-03-02', '2026-03-03', '2');
    const B = task('B', '2026-03-04', '2026-03-05', '2');
    expect(() => calculateCriticalPath([A, B], [dep('A', 'B'), dep('B', 'A')])).toThrow(PlanningError);
  });
});

describe('holgura — rama paralela más corta no es crítica', () => {
  // A → B (5 días) y A → C (2 días). C es más corta ⇒ no crítica.
  const A = task('A', '2026-03-02', '2026-03-06', '5');
  const B = task('B', '2026-03-09', '2026-03-13', '5');
  const C = task('C', '2026-03-09', '2026-03-10', '2');
  const result = calculateCriticalPath([A, B, C], [dep('A', 'B'), dep('A', 'C')]);

  it('la rama larga (B) es crítica y la corta (C) no', () => {
    expect(result.criticalTaskIds).toContain('B');
    expect(result.criticalTaskIds).not.toContain('C');
  });

  it('C tiene holgura total > 0', () => {
    const floatC = result.taskFloat.find((f) => f.taskId === 'C');
    expect(floatC).toBeDefined();
    expect(parseFloat(floatC!.totalFloatDays)).toBeGreaterThan(0);
  });
});

describe('hitos y tipos de dependencia', () => {
  it('un hito (duración 0) no rompe el cálculo', () => {
    const A = task('A', '2026-03-02', '2026-03-06', '5');
    const M = task('M', '2026-03-06', '2026-03-06', '0', { isMilestone: true });
    const r = calculateCriticalPath([A, M], [dep('A', 'M')]);
    expect(r.criticalTaskIds.length).toBeGreaterThan(0);
  });

  it('FS/SS/FF/SF se aceptan sin error', () => {
    const A = task('A', '2026-03-02', '2026-03-06', '5');
    const B = task('B', '2026-03-03', '2026-03-09', '5');
    for (const t of ['FS', 'SS', 'FF', 'SF'] as DependencyType[]) {
      expect(() => calculateCriticalPath([A, B], [dep('A', 'B', t)])).not.toThrow();
    }
  });
});

/* ---------------------------------------------------------------------------
 * View-model — proyección por rol (privacidad backend-first)
 * ------------------------------------------------------------------------- */

function view(id: string, start: string, end: string, dur: string, progress = '0', isMilestone = false): ScheduleTaskView {
  return {
    id,
    wbsCode: id,
    name: `Tarea ${id}`,
    parentTaskId: null,
    plannedStart: start,
    plannedEnd: end,
    plannedDurationDays: dur,
    progressPct: progress,
    status: 'not_started',
    isMilestone,
    sortOrder: 0,
  };
}

function summary(): ScheduleSummary {
  const tasks: ScheduleTaskView[] = [
    view('A', '2026-03-02', '2026-03-06', '5', '100'),
    view('B', '2026-03-09', '2026-03-13', '5', '50'),
  ];
  const dependencies: DependencyView[] = [
    { predecessorTaskId: 'A', successorTaskId: 'B', dependencyType: 'FS', lagDays: '0' },
  ];
  return {
    projectId: PROJ,
    tasks,
    dependencies,
    milestones: [],
    physicalProgressPct: '75',
  };
}

describe('buildPlanningViewModel — privacidad por rol', () => {
  it('rol autorizado (canSeeCriticalPath=true) recibe ruta crítica y criticalTaskIds', () => {
    const vm = buildPlanningViewModel(summary(), { canSeeCriticalPath: true });
    expect(vm.criticalPath).toBeDefined();
    expect(vm.criticalTaskIds.length).toBeGreaterThan(0);
  });

  it('rol `client` (canSeeCriticalPath=false) NO recibe ruta crítica', () => {
    const vm = buildPlanningViewModel(summary(), { canSeeCriticalPath: false });
    expect(vm.criticalPath).toBeUndefined();
    expect(vm.criticalTaskIds).toHaveLength(0);
  });

  it('avance físico se preserva como DecimalString', () => {
    const vm = buildPlanningViewModel(summary(), { canSeeCriticalPath: true });
    expect(typeof vm.physicalProgressPct).toBe('string');
    expect(vm.physicalProgressPct).toBe('75');
  });
});
