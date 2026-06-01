/**
 * view-model.ts — Ensamblado PURO del modelo de vista de la página `/planning`
 * (Oleada 3B).
 *
 * Propiedad: agent-planning. Funciones PURAS (sin DB, sin React). Toman el
 * `ScheduleSummary` proyectado por rol del read-model y producen el view-model
 * que consume el Server Component, incluyendo:
 *   - Ruta crítica / holguras (CPM del dominio puro), SÓLO para roles autorizados.
 *   - Comparativo planificado vs ejecutado (brecha de avance) por tarea.
 *   - Alertas de atraso (configurable por umbral).
 *
 * PRIVACIDAD (PLANNING_CONTRACT §4): el read-model YA omite los campos 🔒 para
 * rol `client` (holguras/ruta crítica/avance financiero). Este módulo respeta
 * esa frontera: NO recalcula la ruta crítica para `client` y nunca la inyecta en
 * el view-model de cliente.
 *
 * Toda magnitud (avance/brecha/holgura/duración) viaja como `DecimalString`.
 */

import { calculateCriticalPath } from './cpm';
import { toDecimal, toDecimalString } from './decimal';
import { isoDateToDayIndex } from './date';
import type {
  CriticalPathSummary,
  DecimalString,
  DependencyView,
  IsoDate,
  PlanningTask,
  ScheduleTaskView,
  TaskDependency,
  Uuid,
} from './types';
// `buildPlanningViewModel` consume el `ScheduleSummary` CANÓNICO del read-model
// (lo que devuelve `getReadModel().getSchedule`), no el resumen interno del
// dominio. Una sola fuente de verdad para el DTO de la página.
import type { ScheduleSummary } from '@/lib/contracts/read-model';

/** Estado del comparativo plan vs real de una tarea. */
export type ProgressVarianceStatus = 'ahead' | 'on_track' | 'behind';

/** Tarea enriquecida para la vista (avance, brecha, holguras si autorizado). */
export interface PlanningTaskRow extends ScheduleTaskView {
  /** Avance esperado a la fecha de corte (0..100), según el calendario plan. */
  expectedProgressPct: DecimalString;
  /** Brecha = avance real − esperado (puede ser negativa = atraso). */
  progressVariancePct: DecimalString;
  /** Clasificación de la brecha respecto al umbral de atraso. */
  varianceStatus: ProgressVarianceStatus;
}

/** Alerta de atraso de una tarea. */
export interface DelayAlert {
  taskId: Uuid;
  wbsCode: string;
  name: string;
  /** Atraso en puntos porcentuales (positivo). */
  behindByPct: DecimalString;
}

/** Configuración del view-model. */
export interface PlanningViewModelOptions {
  /**
   * Fecha de corte para el avance esperado (ISO `YYYY-MM-DD`). Por defecto la
   * fecha de fin de proyecto (todo el plan debería estar al 100%). En la página
   * se pasa "hoy".
   */
  asOfDate?: IsoDate;
  /**
   * Umbral de atraso en puntos porcentuales. Una tarea cuya brecha sea menor o
   * igual a `−threshold` se considera atrasada. Por defecto 5.
   */
  delayThresholdPct?: number;
  /**
   * `true` si el rol puede ver holguras/ruta crítica. Para `client` debe ser
   * `false`: no se calcula ni expone la ruta crítica.
   */
  canSeeCriticalPath: boolean;
}

/** Modelo de vista completo de la página `/planning`. */
export interface PlanningViewModel {
  projectId: Uuid;
  tasks: PlanningTaskRow[];
  dependencies: DependencyView[];
  /** Avance físico agregado del proyecto (read-model). */
  physicalProgressPct: DecimalString;
  /** 🔒 ruta crítica (sólo roles autorizados; `undefined` para `client`). */
  criticalPath?: CriticalPathSummary;
  /** IDs en ruta crítica (vacío para `client`). */
  criticalTaskIds: Uuid[];
  /** Alertas de atraso ordenadas por mayor atraso primero. */
  delayAlerts: DelayAlert[];
  /** Fecha de corte usada para el avance esperado. */
  asOfDate: IsoDate;
}

/**
 * Convierte una `ScheduleTaskView` del read-model en un `PlanningTask` del
 * dominio para el CPM. Sólo se usa cuando el rol está autorizado (los DTOs de
 * `client` carecen de campos 🔒, pero las fechas/duración están siempre).
 *
 * @param view - Tarea proyectada.
 * @param projectId - ID del proyecto.
 * @returns Tarea de dominio.
 */
export function taskViewToDomain(
  view: ScheduleTaskView,
  projectId: Uuid,
): PlanningTask {
  return {
    id: view.id,
    projectId,
    parentTaskId: view.parentTaskId ?? null,
    wbsCode: view.wbsCode,
    name: view.name,
    plannedStart: view.plannedStart,
    plannedEnd: view.plannedEnd,
    plannedDurationDays: view.plannedDurationDays,
    progressPct: view.progressPct,
    status: view.status,
    isMilestone: view.isMilestone,
    sortOrder: view.sortOrder,
  };
}

/** Convierte una `DependencyView` en `TaskDependency` del dominio. */
export function dependencyViewToDomain(dep: DependencyView): TaskDependency {
  return {
    // El read-model no expone el id de la dependencia; se sintetiza uno estable.
    id: `${dep.predecessorTaskId}->${dep.successorTaskId}`,
    predecessorTaskId: dep.predecessorTaskId,
    successorTaskId: dep.successorTaskId,
    dependencyType: dep.dependencyType,
    lagDays: dep.lagDays,
  };
}

/**
 * CPM sobre las tareas HOJA (frappe/CPM no debe contar padres y sus hijos a la
 * vez; los padres son agregadores de WBS). Devuelve `null` si no hay hojas o si
 * el rol no está autorizado.
 *
 * El cálculo es defensivo: si el dominio lanza (datos inconsistentes), se
 * devuelve `null` para no romper la página (la UI degrada a "sin ruta crítica").
 *
 * @param tasks - Tareas proyectadas (todas).
 * @param dependencies - Dependencias proyectadas.
 * @param projectId - ID del proyecto.
 * @returns Resultado CPM o `null`.
 */
interface CpmResult {
  criticalTaskIds: Uuid[];
  summary: CriticalPathSummary;
  /** Holguras por tarea (sólo tareas hoja); ausente para padres/hitos no-hoja. */
  floatByTask: Map<Uuid, { totalFloatDays: DecimalString; freeFloatDays: DecimalString }>;
}

function computeCriticalPathSafe(
  tasks: readonly ScheduleTaskView[],
  dependencies: readonly DependencyView[],
  projectId: Uuid,
): CpmResult | null {
  const parentIds = new Set<Uuid>();
  for (const t of tasks) {
    if (t.parentTaskId) parentIds.add(t.parentTaskId);
  }
  const leafTasks = tasks.filter((t) => !parentIds.has(t.id));
  const leafIds = new Set<Uuid>(leafTasks.map((t) => t.id));
  // Sólo dependencias entre hojas (las que el CPM puede resolver).
  const leafDeps = dependencies.filter(
    (d) => leafIds.has(d.predecessorTaskId) && leafIds.has(d.successorTaskId),
  );
  if (leafTasks.length === 0) return null;

  try {
    const domainTasks = leafTasks.map((t) => taskViewToDomain(t, projectId));
    const domainDeps = leafDeps.map(dependencyViewToDomain);
    const cpm = calculateCriticalPath(domainTasks, domainDeps);
    const floatByTask = new Map<
      Uuid,
      { totalFloatDays: DecimalString; freeFloatDays: DecimalString }
    >();
    for (const f of cpm.taskFloat) {
      floatByTask.set(f.taskId, {
        totalFloatDays: f.totalFloatDays,
        freeFloatDays: f.freeFloatDays,
      });
    }
    return {
      criticalTaskIds: cpm.criticalTaskIds,
      summary: {
        criticalTaskIds: cpm.criticalTaskIds,
        projectStart: cpm.projectStart,
        projectEnd: cpm.projectEnd,
        durationDays: cpm.durationDays,
      },
      floatByTask,
    };
  } catch {
    return null;
  }
}

/**
 * Avance esperado (0..100) de una tarea a la fecha de corte, asumiendo avance
 * lineal entre `plannedStart` y `plannedEnd` (inclusivo). Antes del inicio → 0;
 * después del fin → 100. Un hito vale 100 si la fecha de corte alcanzó su fecha.
 *
 * @param task - Tarea proyectada.
 * @param asOfDayIndex - Índice de día de la fecha de corte.
 * @returns Avance esperado como `DecimalString` (0..100).
 */
export function expectedProgressFor(
  task: ScheduleTaskView,
  asOfDayIndex: number,
): DecimalString {
  const start = isoDateToDayIndex(task.plannedStart);
  const end = isoDateToDayIndex(task.plannedEnd);

  if (task.isMilestone) {
    return asOfDayIndex >= start ? '100' : '0';
  }
  if (asOfDayIndex < start) return '0';
  // Duración inclusiva en días: end - start + 1.
  const totalDays = end - start + 1;
  if (asOfDayIndex >= end || totalDays <= 0) return '100';

  const elapsed = asOfDayIndex - start + 1;
  const ratio = toDecimal(String(elapsed)).dividedBy(toDecimal(String(totalDays)));
  const pct = ratio.times(100);
  // Acota a [0,100].
  if (pct.lt(0)) return '0';
  if (pct.gt(100)) return '100';
  return toDecimalString(pct);
}

/**
 * Clasifica la brecha de avance contra el umbral de atraso.
 *
 * @param variancePct - Brecha (real − esperado), `DecimalString`.
 * @param thresholdPct - Umbral de atraso (puntos porcentuales, positivo).
 * @returns Estado de la brecha.
 */
export function classifyVariance(
  variancePct: DecimalString,
  thresholdPct: number,
): ProgressVarianceStatus {
  const v = toDecimal(variancePct);
  const threshold = toDecimal(String(thresholdPct));
  if (v.gt(threshold)) return 'ahead';
  if (v.lt(threshold.negated())) return 'behind';
  return 'on_track';
}

/**
 * Ensambla el view-model de la página `/planning` a partir del `ScheduleSummary`
 * del read-model (ya proyectado por rol).
 *
 * @param summary - Resumen del cronograma del read-model.
 * @param options - Fecha de corte, umbral de atraso y permiso de ruta crítica.
 * @returns View-model con brecha de avance, alertas y (si autorizado) ruta crítica.
 */
export function buildPlanningViewModel(
  summary: ScheduleSummary,
  options: PlanningViewModelOptions,
): PlanningViewModel {
  const thresholdPct = options.delayThresholdPct ?? 5;
  // Fecha de corte por defecto: fin de proyecto (todo debería estar al 100%).
  const asOfDate =
    options.asOfDate ?? lastPlannedEnd(summary.tasks) ?? '1970-01-01';
  const asOfDayIndex = isoDateToDayIndex(asOfDate);

  // Ruta crítica sólo para roles autorizados.
  const cpm = options.canSeeCriticalPath
    ? computeCriticalPathSafe(summary.tasks, summary.dependencies, summary.projectId)
    : null;
  const criticalTaskIds = cpm?.criticalTaskIds ?? [];
  const criticalSet = new Set<Uuid>(criticalTaskIds);

  const tasks: PlanningTaskRow[] = summary.tasks.map((view) => {
    const expectedProgressPct = expectedProgressFor(view, asOfDayIndex);
    const variance = toDecimal(view.progressPct).minus(
      toDecimal(expectedProgressPct),
    );
    const progressVariancePct = toDecimalString(variance);
    const varianceStatus = classifyVariance(progressVariancePct, thresholdPct);

    const row: PlanningTaskRow = {
      ...view,
      expectedProgressPct,
      progressVariancePct,
      varianceStatus,
    };
    // Holguras/marca crítica SÓLO si el rol está autorizado.
    if (options.canSeeCriticalPath) {
      row.isCritical = criticalSet.has(view.id);
      const f = cpm?.floatByTask.get(view.id);
      if (f) {
        row.totalFloatDays = f.totalFloatDays;
        row.freeFloatDays = f.freeFloatDays;
      }
    }
    return row;
  });

  const delayAlerts: DelayAlert[] = tasks
    .filter((t) => t.varianceStatus === 'behind' && !t.isMilestone)
    .map((t) => ({
      taskId: t.id,
      wbsCode: t.wbsCode,
      name: t.name,
      behindByPct: toDecimalString(toDecimal(t.progressVariancePct).negated()),
    }))
    .sort((a, b) =>
      toDecimal(b.behindByPct).comparedTo(toDecimal(a.behindByPct)),
    );

  return {
    projectId: summary.projectId,
    tasks,
    dependencies: summary.dependencies,
    physicalProgressPct: summary.physicalProgressPct,
    criticalPath: cpm?.summary,
    criticalTaskIds,
    delayAlerts,
    asOfDate,
  };
}

/** Mayor `plannedEnd` entre las tareas (o `undefined` si no hay tareas). */
function lastPlannedEnd(tasks: readonly ScheduleTaskView[]): IsoDate | undefined {
  let maxIdx = Number.NEGATIVE_INFINITY;
  let maxDate: IsoDate | undefined;
  for (const t of tasks) {
    const idx = isoDateToDayIndex(t.plannedEnd);
    if (idx > maxIdx) {
      maxIdx = idx;
      maxDate = t.plannedEnd;
    }
  }
  return maxDate;
}
