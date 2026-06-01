/**
 * compute-planning.ts — Ensamblado de los DTOs de PLANIFICACIÓN del read-model
 * a partir de filas crudas (Oleada 3B — PLANNING_CONTRACT §3).
 *
 * Propiedad: agent-db-rls. Compartido por las dos implementaciones del puerto
 * (fixture y Drizzle) para garantizar idénticos resultados.
 *
 * IMPORTANTE — frontera con el dominio:
 *  - La RUTA CRÍTICA y las HOLGURAS (CPM: orden topológico + forward/backward
 *    pass) son responsabilidad del dominio puro `apps/web/modules/planning/`
 *    (agent-planning). Ese módulo NO existe todavía en este worktree.
 *  - Por eso aquí se exponen los DATOS CRUDOS del cronograma y `criticalPath`
 *    queda OPCIONAL/OMITIDA (TODO: cablear en integración cuando agent-planning
 *    publique el cómputo CPM). Cero cálculo de ruta crítica en este archivo.
 *  - El `physicalProgressPct` del resumen es una AGREGACIÓN simple (promedio
 *    ponderado por duración de las tareas hoja), no un cálculo CPM. Se usa
 *    Decimal.js (sin float) y se documenta como agregación del read-model.
 */

import { toDecimal, toDecimalString } from '@/modules/apu';
import type {
  DependencyView,
  DecimalString,
  IsoDate,
  MilestoneView,
  ScheduleSummary,
  ScheduleTaskStatus,
  ScheduleTaskView,
  DependencyType,
  Uuid,
} from '@/lib/contracts/read-model';

/* ----------------------------------------------------------------------------
 * Filas crudas (espejo de las columnas relevantes del esquema de planning)
 * ------------------------------------------------------------------------- */

/** Fila mínima de tarea del cronograma. */
export interface RawScheduleTask {
  id: Uuid;
  parentTaskId?: Uuid | null;
  wbsCode: string;
  name: string;
  plannedStart: IsoDate;
  plannedEnd: IsoDate;
  plannedDurationDays: DecimalString;
  progressPct: DecimalString;
  status: ScheduleTaskStatus;
  isMilestone: boolean;
  sortOrder: number;
  /** 🔒 mapeo externo (MS Project / sistemas). */
  externalReference?: string | null;
}

/** Fila mínima de dependencia. */
export interface RawTaskDependency {
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: DependencyType;
  lagDays: DecimalString;
}

/** Entrada para ensamblar el cronograma de un proyecto. */
export interface ScheduleComputationInput {
  projectId: Uuid;
  tasks: readonly RawScheduleTask[];
  dependencies: readonly RawTaskDependency[];
}

/* ----------------------------------------------------------------------------
 * Agregación de avance físico (read-model, NO CPM)
 * ------------------------------------------------------------------------- */

/** IDs de tareas que son padres (tienen al menos una subtarea). */
function parentIds(tasks: readonly RawScheduleTask[]): Set<Uuid> {
  const parents = new Set<Uuid>();
  for (const t of tasks) {
    if (t.parentTaskId) parents.add(t.parentTaskId);
  }
  return parents;
}

/**
 * Avance físico agregado del proyecto: promedio PONDERADO por duración de las
 * tareas HOJA no-hito (las que no tienen subtareas). Si la duración total es 0,
 * cae a un promedio simple de avances. Resultado en `DecimalString` (0..100).
 *
 * Es una agregación del read-model para alimentar el resumen; el avance
 * autoritativo por tarea vive en `progress_pct`/`progress_entries`.
 */
export function aggregatePhysicalProgress(
  tasks: readonly RawScheduleTask[],
): DecimalString {
  const parents = parentIds(tasks);
  const leaves = tasks.filter((t) => !parents.has(t.id) && !t.isMilestone);
  if (leaves.length === 0) return '0';

  let weightSum = toDecimal('0');
  let weightedProgress = toDecimal('0');
  for (const t of leaves) {
    const w = toDecimal(t.plannedDurationDays);
    weightSum = weightSum.plus(w);
    weightedProgress = weightedProgress.plus(w.times(toDecimal(t.progressPct)));
  }

  if (weightSum.isZero()) {
    // Fallback: promedio simple cuando todas las duraciones son 0.
    const simple = leaves.reduce(
      (acc, t) => acc.plus(toDecimal(t.progressPct)),
      toDecimal('0'),
    );
    return toDecimalString(simple.dividedBy(leaves.length));
  }
  return toDecimalString(weightedProgress.dividedBy(weightSum));
}

/* ----------------------------------------------------------------------------
 * Ensamblado del cronograma (DTOs cliente-safe / pre-proyección por rol)
 *
 * Se construye el ScheduleSummary COMPLETO (incluyendo campos 🔒 cuando estén
 * disponibles). La proyección por rol (omitir 🔒 para `client`) la aplica el
 * repositorio vía `projectScheduleForRole` (types.ts).
 * ------------------------------------------------------------------------- */

/** Convierte una fila cruda en `ScheduleTaskView` (sin holguras/ruta crítica). */
function toTaskView(t: RawScheduleTask): ScheduleTaskView {
  return {
    id: t.id,
    wbsCode: t.wbsCode,
    name: t.name,
    parentTaskId: t.parentTaskId ?? null,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    plannedDurationDays: t.plannedDurationDays,
    progressPct: t.progressPct,
    status: t.status,
    isMilestone: t.isMilestone,
    sortOrder: t.sortOrder,
    // totalFloatDays/freeFloatDays/isCritical los aporta el dominio CPM
    // (agent-planning) en integración; aquí se omiten (datos crudos).
  };
}

/**
 * Ensambla el `ScheduleSummary` de un proyecto a partir de filas crudas.
 * Función PURA respecto a la entrada (no toca DB ni red). `criticalPath` se
 * OMITE (TODO: integrar `apps/web/modules/planning/` para CPM/holguras).
 *
 * @param input - Tareas y dependencias del proyecto.
 * @returns Resumen del cronograma (sin proyectar por rol).
 */
export function computeSchedule(input: ScheduleComputationInput): ScheduleSummary {
  const orderedTasks = [...input.tasks].sort((a, b) => a.sortOrder - b.sortOrder);

  const tasks: ScheduleTaskView[] = orderedTasks.map(toTaskView);

  const dependencies: DependencyView[] = input.dependencies.map((d) => ({
    predecessorTaskId: d.predecessorTaskId,
    successorTaskId: d.successorTaskId,
    dependencyType: d.dependencyType,
    lagDays: d.lagDays,
  }));

  const milestones: MilestoneView[] = orderedTasks
    .filter((t) => t.isMilestone)
    .map((t) => ({
      id: t.id,
      name: t.name,
      date: t.plannedStart,
      status: t.status,
    }));

  const physicalProgressPct = aggregatePhysicalProgress(input.tasks);

  return {
    projectId: input.projectId,
    tasks,
    dependencies,
    milestones,
    physicalProgressPct,
    // criticalPath: OMITIDO hasta cablear el dominio CPM (agent-planning).
  };
}
