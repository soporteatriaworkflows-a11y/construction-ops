/**
 * recalc.ts — Recálculo básico de fechas del cronograma (SCHEDULE_FROM_BOQ_V1 §5).
 *
 * Propiedad: agent-orchestrator. Dominio PURO (sin DB/React). Forward-pass sobre
 * índices de día (convención INCLUSIVA, igual que `date.ts`): una tarea de N días
 * ocupa [startIdx, startIdx+N-1]; un hito (N=0) ocupa [startIdx, startIdx].
 *
 * Dependencias soportadas (V1): FS (default), SS, FF, SF + `lag_days` (entero,
 * puede ser negativo). Se rechazan ciclos (PlanningError 'cycle'). La ruta crítica
 * avanzada queda en `cpm.ts` (deuda SCHEDULE_CRITICAL_PATH_V2); este módulo solo
 * propaga fechas aguas abajo de forma determinista.
 */

import { dayIndexToIsoDate, isoDateToDayIndex } from './date';
import { PlanningError } from './types';
import type { DependencyType, IsoDate, Uuid } from './types';

export interface RecalcTaskInput {
  id: Uuid;
  /** Duración planificada en días (entero ≥ 0; hito = 0). */
  durationDays: number;
  isMilestone: boolean;
  /** Inicio fijado manualmente (solo se usa si la tarea no tiene predecesoras). */
  manualStart?: IsoDate | null;
}

export interface RecalcDependency {
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: DependencyType;
  lagDays: number;
}

export interface RecalcTaskResult {
  id: Uuid;
  plannedStart: IsoDate;
  plannedEnd: IsoDate;
}

export interface RecalcResult {
  tasks: RecalcTaskResult[];
  /** Fecha fin más tardía del cronograma (o el inicio si no hay tareas). */
  scheduleEnd: IsoDate;
}

/** Fin inclusivo dado un inicio y una duración (días). */
function endIndex(startIdx: number, durationDays: number): number {
  return startIdx + Math.max(0, Math.floor(durationDays) - 1);
}

/**
 * Recalcula `plannedStart`/`plannedEnd` de todas las tareas propagando las
 * dependencias aguas abajo. Orden topológico (Kahn); ciclo ⇒ PlanningError.
 *
 * @throws PlanningError('cycle') si las dependencias forman un ciclo.
 * @throws PlanningError('unknown_task') si una dependencia referencia un id ausente.
 */
export function recalculateScheduleDates(params: {
  scheduleStart: IsoDate;
  tasks: RecalcTaskInput[];
  dependencies: RecalcDependency[];
}): RecalcResult {
  const { scheduleStart, tasks, dependencies } = params;
  const baseIdx = isoDateToDayIndex(scheduleStart);

  const byId = new Map<Uuid, RecalcTaskInput>();
  for (const t of tasks) byId.set(t.id, t);

  // Grafo + indegree para Kahn.
  const successors = new Map<Uuid, RecalcDependency[]>();
  const indegree = new Map<Uuid, number>();
  for (const t of tasks) indegree.set(t.id, 0);

  for (const dep of dependencies) {
    if (!byId.has(dep.predecessorTaskId) || !byId.has(dep.successorTaskId)) {
      throw new PlanningError(
        'unknown_task',
        `Dependencia con tarea inexistente: ${dep.predecessorTaskId} → ${dep.successorTaskId}`,
        [dep.predecessorTaskId, dep.successorTaskId],
      );
    }
    const list = successors.get(dep.predecessorTaskId);
    if (list) list.push(dep);
    else successors.set(dep.predecessorTaskId, [dep]);
    indegree.set(dep.successorTaskId, (indegree.get(dep.successorTaskId) ?? 0) + 1);
  }

  // Inicio temprano por tarea (índice de día). Default = manualStart o base.
  const startIdx = new Map<Uuid, number>();
  for (const t of tasks) {
    const manual = t.manualStart ? isoDateToDayIndex(t.manualStart) : baseIdx;
    startIdx.set(t.id, manual);
  }

  // Cola de tareas sin predecesoras (orden estable por aparición).
  const queue: Uuid[] = [];
  for (const t of tasks) {
    if ((indegree.get(t.id) ?? 0) === 0) queue.push(t.id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift() as Uuid;
    processed += 1;
    const task = byId.get(id) as RecalcTaskInput;
    const sIdx = startIdx.get(id) as number;
    const eIdx = endIndex(sIdx, task.isMilestone ? 0 : task.durationDays);

    for (const dep of successors.get(id) ?? []) {
      const succ = byId.get(dep.successorTaskId) as RecalcTaskInput;
      const succDur = succ.isMilestone ? 0 : Math.max(0, Math.floor(succ.durationDays) - 1);
      const lag = Math.floor(dep.lagDays);
      let minStart: number;
      switch (dep.dependencyType) {
        case 'SS':
          minStart = sIdx + lag;
          break;
        case 'FF':
          minStart = eIdx + lag - succDur;
          break;
        case 'SF':
          minStart = sIdx + lag - succDur;
          break;
        case 'FS':
        default:
          minStart = eIdx + 1 + lag;
          break;
      }
      const current = startIdx.get(dep.successorTaskId) as number;
      if (minStart > current) startIdx.set(dep.successorTaskId, minStart);

      const remaining = (indegree.get(dep.successorTaskId) ?? 0) - 1;
      indegree.set(dep.successorTaskId, remaining);
      if (remaining === 0) queue.push(dep.successorTaskId);
    }
  }

  if (processed < tasks.length) {
    throw new PlanningError('cycle', 'Las dependencias del cronograma forman un ciclo.');
  }

  let latestEnd = baseIdx;
  const resultTasks: RecalcTaskResult[] = tasks.map((t) => {
    const sIdx = startIdx.get(t.id) as number;
    const eIdx = endIndex(sIdx, t.isMilestone ? 0 : t.durationDays);
    if (eIdx > latestEnd) latestEnd = eIdx;
    return {
      id: t.id,
      plannedStart: dayIndexToIsoDate(sIdx),
      plannedEnd: dayIndexToIsoDate(eIdx),
    };
  });

  return { tasks: resultTasks, scheduleEnd: dayIndexToIsoDate(latestEnd) };
}

/**
 * Detecta si agregar la dependencia `pred → succ` crearía un ciclo, dado el
 * conjunto actual de dependencias. Útil para validar ANTES de persistir.
 */
export function dependencyWouldCreateCycle(
  existing: ReadonlyArray<Pick<RecalcDependency, 'predecessorTaskId' | 'successorTaskId'>>,
  pred: Uuid,
  succ: Uuid,
): boolean {
  if (pred === succ) return true;
  // ¿`succ` alcanza a `pred` siguiendo las aristas existentes? Si sí, agregar
  // pred→succ cierra el ciclo.
  const adj = new Map<Uuid, Uuid[]>();
  for (const d of existing) {
    const l = adj.get(d.predecessorTaskId);
    if (l) l.push(d.successorTaskId);
    else adj.set(d.predecessorTaskId, [d.successorTaskId]);
  }
  const stack: Uuid[] = [succ];
  const seen = new Set<Uuid>();
  while (stack.length > 0) {
    const cur = stack.pop() as Uuid;
    if (cur === pred) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const n of adj.get(cur) ?? []) stack.push(n);
  }
  return false;
}
