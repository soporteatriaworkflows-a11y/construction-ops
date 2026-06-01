/**
 * cpm.ts — Critical Path Method (ruta crítica + holguras) para planning.
 *
 * Propiedad: agent-planning. Funciones PURAS (sin DB, sin React).
 *
 * MODELO:
 *   - Cada tarea ocupa en el eje temporal un intervalo [ES, EF] (early) y
 *     [LS, LF] (late), medido en días (eje continuo, ancla = índice de día UTC
 *     de la fecha mínima del proyecto).
 *   - Duración efectiva en el eje: para una tarea de N días calendario, su
 *     finish = start + N − 1 + 1 = start + N en unidades de eje, pero como el
 *     CPM encadena por "instantes" usamos duración = N para tareas (1 día → 1) y
 *     0 para hitos. Internamente:  EF = ES + dur,  donde `dur` = días planificados.
 *   - Restricciones por tipo de dependencia (con lag L, en días):
 *       FS: ES_succ >= EF_pred + L
 *       SS: ES_succ >= ES_pred + L
 *       FF: EF_succ >= EF_pred + L
 *       SF: EF_succ >= ES_pred + L
 *   - Forward pass (orden topológico) fija ES/EF tempranos.
 *   - Backward pass (orden inverso) fija LS/LF tardíos contra el fin de proyecto.
 *   - Holgura total = LS − ES (= LF − EF). Holgura libre = min sobre sucesores
 *     del margen antes de empujar el ES temprano del sucesor.
 *   - Tarea crítica ⇔ holgura total = 0.
 *
 * Toda salida hacia el dominio se serializa como `DecimalString` (sin float en
 * los contratos). El cálculo interno usa `number` en el eje de días enteros
 * (las duraciones/lags del cronograma son días enteros), y se serializa al final.
 */

import { dayIndexToIsoDate, isoDateToDayIndex } from './date';
import { toDecimalString, toDecimal } from './decimal';
import { buildScheduleNetwork } from './graph';
import type { ScheduleEdge, ScheduleNetwork } from './graph';
import type {
  CriticalPathResult,
  PlanningTask,
  TaskDependency,
  TaskFloat,
  Uuid,
} from './types';
import { PlanningError } from './types';

/** Estado temporal interno de una tarea durante el CPM (eje en días). */
interface NodeTiming {
  /** Duración efectiva en el eje (días; hito = 0). */
  duration: number;
  /** Early start (offset desde el ancla de proyecto, en días). */
  earlyStart: number;
  /** Early finish = earlyStart + duration. */
  earlyFinish: number;
  /** Late start. */
  lateStart: number;
  /** Late finish. */
  lateFinish: number;
}

/** Convierte la duración planificada (DecimalString) a número de eje. */
function axisDuration(task: PlanningTask): number {
  if (task.isMilestone) return 0;
  const n = toDecimal(task.plannedDurationDays).toNumber();
  return n;
}

/**
 * Forward pass: calcula ES/EF tempranos respetando el tipo de dependencia y el
 * lag. El ancla de cada tarea sin predecesores es su `plannedStart` (relativo al
 * inicio mínimo del proyecto), de modo que el cronograma respeta las fechas
 * planificadas como restricción mínima.
 */
function forwardPass(
  network: ScheduleNetwork,
  timing: Map<Uuid, NodeTiming>,
  projectAnchor: number,
): void {
  for (const id of network.topologicalOrder) {
    const task = network.tasksById.get(id)!;
    const t = timing.get(id)!;
    // ES inicial = offset de su fecha planificada respecto al ancla.
    const plannedOffset = isoDateToDayIndex(task.plannedStart) - projectAnchor;
    let es = plannedOffset;

    for (const edge of network.predecessors.get(id) ?? []) {
      const p = timing.get(edge.predecessorTaskId)!;
      const constraint = forwardConstraintStart(edge, p, t.duration);
      if (constraint > es) es = constraint;
    }
    t.earlyStart = es;
    t.earlyFinish = es + t.duration;
  }
}

/**
 * Devuelve el ES mínimo del sucesor impuesto por una arista, dado el timing del
 * predecesor y la duración del sucesor. Se expresa siempre como restricción
 * sobre el `earlyStart` del sucesor.
 */
function forwardConstraintStart(
  edge: ScheduleEdge,
  pred: NodeTiming,
  succDuration: number,
): number {
  const L = edge.lagDays;
  switch (edge.dependencyType) {
    case 'FS':
      // ES_succ >= EF_pred + L
      return pred.earlyFinish + L;
    case 'SS':
      // ES_succ >= ES_pred + L
      return pred.earlyStart + L;
    case 'FF':
      // EF_succ >= EF_pred + L  ⇒  ES_succ >= EF_pred + L − dur_succ
      return pred.earlyFinish + L - succDuration;
    case 'SF':
      // EF_succ >= ES_pred + L  ⇒  ES_succ >= ES_pred + L − dur_succ
      return pred.earlyStart + L - succDuration;
    default: {
      const exhaustive: never = edge.dependencyType;
      throw new PlanningError(
        'invalid_dependency',
        `Tipo de dependencia desconocido: ${String(exhaustive)}`,
      );
    }
  }
}

/**
 * Backward pass: calcula LS/LF tardíos. El fin de proyecto es el máximo
 * `earlyFinish`. Cada tarea sin sucesores fija LF = projectEnd; las demás se
 * acotan por las restricciones inversas de sus sucesores.
 */
function backwardPass(
  network: ScheduleNetwork,
  timing: Map<Uuid, NodeTiming>,
  projectEnd: number,
): void {
  const reversed = [...network.topologicalOrder].reverse();
  for (const id of reversed) {
    const t = timing.get(id)!;
    const succEdges = network.successors.get(id) ?? [];
    let lf: number;
    if (succEdges.length === 0) {
      lf = projectEnd;
    } else {
      lf = Number.POSITIVE_INFINITY;
      for (const edge of succEdges) {
        const s = timing.get(edge.successorTaskId)!;
        const constraint = backwardConstraintFinish(edge, s, t.duration);
        if (constraint < lf) lf = constraint;
      }
      // No puede exceder el fin de proyecto.
      if (lf > projectEnd) lf = projectEnd;
    }
    t.lateFinish = lf;
    t.lateStart = lf - t.duration;
  }
}

/**
 * Devuelve el LF máximo del predecesor impuesto por una arista, dado el timing
 * del sucesor y la duración del predecesor. Se expresa como cota sobre el
 * `lateFinish` del predecesor.
 */
function backwardConstraintFinish(
  edge: ScheduleEdge,
  succ: NodeTiming,
  predDuration: number,
): number {
  const L = edge.lagDays;
  switch (edge.dependencyType) {
    case 'FS':
      // ES_succ >= EF_pred + L  ⇒  LF_pred <= LS_succ − L
      return succ.lateStart - L;
    case 'SS':
      // ES_succ >= ES_pred + L  ⇒  LS_pred <= LS_succ − L  ⇒  LF_pred <= LS_succ − L + dur_pred
      return succ.lateStart - L + predDuration;
    case 'FF':
      // EF_succ >= EF_pred + L  ⇒  LF_pred <= LF_succ − L
      return succ.lateFinish - L;
    case 'SF':
      // EF_succ >= ES_pred + L  ⇒  LS_pred <= LF_succ − L  ⇒  LF_pred <= LF_succ − L + dur_pred
      return succ.lateFinish - L + predDuration;
    default: {
      const exhaustive: never = edge.dependencyType;
      throw new PlanningError(
        'invalid_dependency',
        `Tipo de dependencia desconocido: ${String(exhaustive)}`,
      );
    }
  }
}

/**
 * Calcula la holgura libre de una tarea: cuánto puede deslizar su finish sin
 * empujar el `earlyStart` temprano de NINGÚN sucesor. Se evalúa por cada arista
 * el margen disponible y se toma el mínimo (0 si no hay sucesores → usa total).
 */
function freeFloatFor(
  id: Uuid,
  network: ScheduleNetwork,
  timing: Map<Uuid, NodeTiming>,
  totalFloat: number,
): number {
  const succEdges = network.successors.get(id) ?? [];
  if (succEdges.length === 0) {
    // Tarea terminal: su holgura libre coincide con la total.
    return totalFloat;
  }
  const t = timing.get(id)!;
  let free = Number.POSITIVE_INFINITY;
  for (const edge of succEdges) {
    const s = timing.get(edge.successorTaskId)!;
    // Holgura disponible antes de empujar el ES temprano del sucesor.
    let slack: number;
    switch (edge.dependencyType) {
      case 'FS':
        slack = s.earlyStart - (t.earlyFinish + edge.lagDays);
        break;
      case 'SS':
        slack = s.earlyStart - (t.earlyStart + edge.lagDays);
        break;
      case 'FF':
        slack = s.earlyFinish - (t.earlyFinish + edge.lagDays);
        break;
      case 'SF':
        slack = s.earlyFinish - (t.earlyStart + edge.lagDays);
        break;
      default: {
        const exhaustive: never = edge.dependencyType;
        throw new PlanningError(
          'invalid_dependency',
          `Tipo de dependencia desconocido: ${String(exhaustive)}`,
        );
      }
    }
    if (slack < free) free = slack;
  }
  if (!Number.isFinite(free)) free = totalFloat;
  // La holgura libre nunca excede la total ni es negativa.
  if (free > totalFloat) free = totalFloat;
  if (free < 0) free = 0;
  return free;
}

/**
 * Ejecuta el Critical Path Method sobre la red ya construida.
 *
 * @param network - Red validada (sin ciclos).
 * @returns Resultado con ruta crítica, holguras y fechas de proyecto.
 * @throws PlanningError si la red está vacía.
 */
export function runCpmOnNetwork(network: ScheduleNetwork): CriticalPathResult {
  if (network.tasksById.size === 0) {
    throw new PlanningError('invalid_dates', 'No hay tareas para calcular la ruta crítica.');
  }

  // Ancla del proyecto = índice de día mínimo entre las fechas planificadas.
  let projectAnchor = Number.POSITIVE_INFINITY;
  for (const task of network.tasksById.values()) {
    const idx = isoDateToDayIndex(task.plannedStart);
    if (idx < projectAnchor) projectAnchor = idx;
  }

  const timing = new Map<Uuid, NodeTiming>();
  for (const [id, task] of network.tasksById) {
    timing.set(id, {
      duration: axisDuration(task),
      earlyStart: 0,
      earlyFinish: 0,
      lateStart: 0,
      lateFinish: 0,
    });
  }

  forwardPass(network, timing, projectAnchor);

  // Fin de proyecto = máximo earlyFinish.
  let projectEnd = Number.NEGATIVE_INFINITY;
  for (const t of timing.values()) {
    if (t.earlyFinish > projectEnd) projectEnd = t.earlyFinish;
  }

  backwardPass(network, timing, projectEnd);

  const taskFloat: TaskFloat[] = [];
  const criticalTaskIds: Uuid[] = [];
  // Recorre en el orden de inserción de tareas (estable, no topológico) para
  // que la salida sea predecible respecto a la entrada.
  for (const id of network.tasksById.keys()) {
    const t = timing.get(id)!;
    const total = t.lateStart - t.earlyStart;
    const free = freeFloatFor(id, network, timing, total);
    const isCritical = total === 0;
    if (isCritical) criticalTaskIds.push(id);
    taskFloat.push({
      taskId: id,
      totalFloatDays: toDecimalString(toDecimal(String(total))),
      freeFloatDays: toDecimalString(toDecimal(String(free))),
      isCritical,
    });
  }

  const projectStart = dayIndexToIsoDate(projectAnchor);
  // El fin se reporta como la fecha del último día ocupado. EF está en eje de
  // días (start + duración). Convertimos restando 1 para devolver el último día
  // calendario inclusivo cuando hay duración; si todo son hitos, EF==start.
  const endDayIndex = projectAnchor + projectEnd;
  const projectEndDate = dayIndexToIsoDate(
    projectEnd > 0 ? endDayIndex - 1 : endDayIndex,
  );
  const durationDays = toDecimalString(toDecimal(String(projectEnd)));

  return {
    criticalTaskIds,
    taskFloat,
    projectStart,
    projectEnd: projectEndDate,
    durationDays,
  };
}

/**
 * Construye la red y ejecuta el CPM en un paso.
 *
 * @param tasks - Tareas del proyecto.
 * @param dependencies - Dependencias entre tareas.
 * @returns Resultado CPM.
 * @throws PlanningError ante datos inválidos o ciclos.
 */
export function calculateCriticalPath(
  tasks: readonly PlanningTask[],
  dependencies: readonly TaskDependency[],
): CriticalPathResult {
  const network = buildScheduleNetwork(tasks, dependencies);
  return runCpmOnNetwork(network);
}
