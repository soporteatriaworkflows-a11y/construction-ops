/**
 * graph.ts — Construcción de la red de cronograma, validación y orden topológico.
 *
 * Propiedad: agent-planning. Funciones PURAS (sin DB, sin React).
 *
 * Responsabilidades:
 *   - Validar tareas (fechas, duraciones, progreso, hitos).
 *   - Validar dependencias (referencias, autodependencia, duplicados).
 *   - Construir la red (predecesores/sucesores por tarea).
 *   - Orden topológico (Kahn) con DETECCIÓN DE CICLOS explícita.
 *
 * Los ciclos se detectan aquí (no por constraint de DB) y lanzan
 * `PlanningError('cycle', …)`.
 */

import { inclusiveDurationDays, isoDateToDayIndex } from './date';
import { eq, isNegative, toDecimal } from './decimal';
import { PlanningError } from './types';
import type {
  PlanningTask,
  TaskDependency,
  Uuid,
} from './types';

/** Arista de dependencia normalizada para el cálculo. */
export interface ScheduleEdge {
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: TaskDependency['dependencyType'];
  /** Lag en días como `number` (eje continuo; puede ser negativo). */
  lagDays: number;
}

/** Red de cronograma lista para el CPM. */
export interface ScheduleNetwork {
  /** Tareas indexadas por id (orden de inserción preservado). */
  tasksById: Map<Uuid, PlanningTask>;
  /** Aristas de dependencia normalizadas. */
  edges: ScheduleEdge[];
  /** Predecesores entrantes por tarea. */
  predecessors: Map<Uuid, ScheduleEdge[]>;
  /** Sucesores salientes por tarea. */
  successors: Map<Uuid, ScheduleEdge[]>;
  /** IDs en orden topológico (predecesores antes que sucesores). */
  topologicalOrder: Uuid[];
}

/**
 * Valida una tarea individual (fechas, duración, progreso, reglas de hito).
 *
 * @param task - Tarea a validar.
 * @throws PlanningError con `kind` específico.
 */
export function validateTask(task: PlanningTask): void {
  const ctx = [task.id];

  // Fechas válidas y coherentes (lanza si end < start).
  const calendarDuration = inclusiveDurationDays(
    task.plannedStart,
    task.plannedEnd,
    ctx,
  );

  // Progreso 0..100.
  const progress = toDecimal(task.progressPct);
  if (progress.lt(0) || progress.gt(100)) {
    throw new PlanningError(
      'invalid_progress',
      `progressPct fuera de rango [0,100] en tarea ${task.wbsCode}: ${task.progressPct}`,
      ctx,
    );
  }

  // Duración no negativa.
  if (isNegative(task.plannedDurationDays)) {
    throw new PlanningError(
      'invalid_duration',
      `plannedDurationDays negativa en tarea ${task.wbsCode}: ${task.plannedDurationDays}`,
      ctx,
    );
  }

  // Reglas de hito: duración 0 y start == end.
  if (task.isMilestone) {
    if (!eq(task.plannedDurationDays, '0')) {
      throw new PlanningError(
        'invalid_milestone',
        `Hito ${task.wbsCode} debe tener plannedDurationDays = 0 (got ${task.plannedDurationDays})`,
        ctx,
      );
    }
    if (task.plannedStart !== task.plannedEnd) {
      throw new PlanningError(
        'invalid_milestone',
        `Hito ${task.wbsCode} debe tener plannedStart = plannedEnd (${task.plannedStart} != ${task.plannedEnd})`,
        ctx,
      );
    }
  } else {
    // Para tareas normales, la duración planificada debe ser > 0.
    if (eq(task.plannedDurationDays, '0')) {
      throw new PlanningError(
        'invalid_duration',
        `Tarea no-hito ${task.wbsCode} con duración 0 (¿debería ser hito?)`,
        ctx,
      );
    }
    // Coherencia calendario↔duración (tolerante: la duración planificada puede
    // diferir del span calendario por días no laborables; solo verificamos que
    // ambos sean positivos, ya garantizado arriba).
    void calendarDuration;
  }
}

/**
 * Normaliza una dependencia validándola contra el conjunto de tareas.
 *
 * @throws PlanningError('invalid_dependency') ante referencias desconocidas o
 *   autodependencia.
 */
function normalizeEdge(
  dep: TaskDependency,
  tasksById: Map<Uuid, PlanningTask>,
): ScheduleEdge {
  if (dep.predecessorTaskId === dep.successorTaskId) {
    throw new PlanningError(
      'invalid_dependency',
      `Autodependencia no permitida en tarea ${dep.predecessorTaskId}`,
      [dep.predecessorTaskId],
    );
  }
  if (!tasksById.has(dep.predecessorTaskId)) {
    throw new PlanningError(
      'unknown_task',
      `Dependencia referencia predecesor inexistente: ${dep.predecessorTaskId}`,
      [dep.predecessorTaskId],
    );
  }
  if (!tasksById.has(dep.successorTaskId)) {
    throw new PlanningError(
      'unknown_task',
      `Dependencia referencia sucesor inexistente: ${dep.successorTaskId}`,
      [dep.successorTaskId],
    );
  }
  const lag = toDecimal(dep.lagDays);
  if (!lag.isFinite()) {
    throw new PlanningError(
      'invalid_dependency',
      `lagDays inválido en dependencia ${dep.id}: ${dep.lagDays}`,
      [dep.predecessorTaskId, dep.successorTaskId],
    );
  }
  return {
    predecessorTaskId: dep.predecessorTaskId,
    successorTaskId: dep.successorTaskId,
    dependencyType: dep.dependencyType,
    lagDays: lag.toNumber(),
  };
}

/**
 * Construye la red de cronograma: valida tareas y dependencias, indexa
 * predecesores/sucesores y calcula el orden topológico (con detección de ciclos).
 *
 * @param tasks - Tareas del proyecto.
 * @param dependencies - Dependencias entre tareas.
 * @returns Red lista para el CPM.
 * @throws PlanningError ante datos inválidos o ciclos.
 */
export function buildScheduleNetwork(
  tasks: readonly PlanningTask[],
  dependencies: readonly TaskDependency[],
): ScheduleNetwork {
  const tasksById = new Map<Uuid, PlanningTask>();
  for (const task of tasks) {
    if (tasksById.has(task.id)) {
      throw new PlanningError(
        'invalid_dependency',
        `Tarea duplicada: ${task.id}`,
        [task.id],
      );
    }
    validateTask(task);
    tasksById.set(task.id, task);
  }

  const predecessors = new Map<Uuid, ScheduleEdge[]>();
  const successors = new Map<Uuid, ScheduleEdge[]>();
  for (const id of tasksById.keys()) {
    predecessors.set(id, []);
    successors.set(id, []);
  }

  const seenPairs = new Set<string>();
  const edges: ScheduleEdge[] = [];
  for (const dep of dependencies) {
    const pairKey = `${dep.predecessorTaskId}->${dep.successorTaskId}`;
    if (seenPairs.has(pairKey)) {
      throw new PlanningError(
        'invalid_dependency',
        `Dependencia duplicada predecesor→sucesor: ${pairKey}`,
        [dep.predecessorTaskId, dep.successorTaskId],
      );
    }
    seenPairs.add(pairKey);
    const edge = normalizeEdge(dep, tasksById);
    edges.push(edge);
    successors.get(edge.predecessorTaskId)!.push(edge);
    predecessors.get(edge.successorTaskId)!.push(edge);
  }

  const topologicalOrder = topologicalSort(tasksById, successors, predecessors);

  return {
    tasksById,
    edges,
    predecessors,
    successors,
    topologicalOrder,
  };
}

/**
 * Orden topológico por el algoritmo de Kahn. Si quedan tareas sin procesar,
 * existe al menos un ciclo y se lanza `PlanningError('cycle', …)`.
 *
 * @param tasksById - Tareas indexadas (preserva orden de inserción).
 * @param successors - Sucesores por tarea.
 * @param predecessors - Predecesores por tarea.
 * @returns IDs en orden topológico.
 * @throws PlanningError('cycle') si la red contiene un ciclo.
 */
export function topologicalSort(
  tasksById: Map<Uuid, PlanningTask>,
  successors: Map<Uuid, ScheduleEdge[]>,
  predecessors: Map<Uuid, ScheduleEdge[]>,
): Uuid[] {
  const indegree = new Map<Uuid, number>();
  for (const id of tasksById.keys()) {
    indegree.set(id, predecessors.get(id)?.length ?? 0);
  }

  // Cola inicial: tareas sin predecesores (orden estable de inserción).
  const queue: Uuid[] = [];
  for (const id of tasksById.keys()) {
    if ((indegree.get(id) ?? 0) === 0) queue.push(id);
  }

  const order: Uuid[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of successors.get(id) ?? []) {
      const next = edge.successorTaskId;
      const deg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== tasksById.size) {
    const cycleNodes = findCycle(tasksById, successors);
    throw new PlanningError(
      'cycle',
      `Ciclo de dependencias detectado: ${cycleNodes.join(' → ')}`,
      cycleNodes,
    );
  }

  return order;
}

/**
 * Encuentra un ciclo concreto (para mensaje de error) vía DFS con coloreo.
 * Devuelve la lista de nodos que forman el ciclo (cerrado), o el conjunto de
 * nodos remanentes si no logra aislar un ciclo simple.
 */
function findCycle(
  tasksById: Map<Uuid, PlanningTask>,
  successors: Map<Uuid, ScheduleEdge[]>,
): Uuid[] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<Uuid, number>();
  for (const id of tasksById.keys()) color.set(id, WHITE);
  const stack: Uuid[] = [];

  const dfs = (node: Uuid): Uuid[] | null => {
    color.set(node, GRAY);
    stack.push(node);
    for (const edge of successors.get(node) ?? []) {
      const next = edge.successorTaskId;
      if (color.get(next) === GRAY) {
        // Ciclo: recorta el stack desde la primera aparición de `next`.
        const idx = stack.indexOf(next);
        return [...stack.slice(idx), next];
      }
      if (color.get(next) === WHITE) {
        const found = dfs(next);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(node, BLACK);
    return null;
  };

  for (const id of tasksById.keys()) {
    if (color.get(id) === WHITE) {
      const found = dfs(id);
      if (found) return found;
    }
  }
  // Fallback (no debería ocurrir si llegamos aquí desde detección de ciclo).
  return [...tasksById.keys()];
}

/** Re-exporta `isoDateToDayIndex` para conveniencia del CPM. */
export { isoDateToDayIndex };
