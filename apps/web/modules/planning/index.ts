/**
 * index.ts — Barril público del dominio de planificación (Oleada 3B).
 *
 * Propiedad: agent-planning. Punto de entrada único para consumidores
 * (Server Components, tests). Exporta SÓLO lógica pura: tipos, CPM, grafo,
 * fechas, mapeo a Gantt y view-model. NADA de DOM/React vive aquí.
 */

export * from './types';
export {
  isoDateToDayIndex,
  dayIndexToIsoDate,
  inclusiveDurationDays,
} from './date';
export {
  toDecimal,
  toDecimalString,
  ZERO,
  lt,
  gt,
  eq,
  isNegative,
  min,
  max,
  PlanningDecimal,
  PLANNING_DECIMAL_PRECISION,
} from './decimal';
export type { PlanningDecimalInstance } from './decimal';
export {
  validateTask,
  buildScheduleNetwork,
  topologicalSort,
} from './graph';
export type { ScheduleEdge, ScheduleNetwork } from './graph';
export { calculateCriticalPath, runCpmOnNetwork } from './cpm';
export {
  mapScheduleToGantt,
  toGanttTask,
  indexPredecessors,
  progressToNumber,
} from './gantt-mapping';
export type { GanttTask, GanttMappingOptions } from './gantt-mapping';
export {
  buildPlanningViewModel,
  taskViewToDomain,
  dependencyViewToDomain,
  expectedProgressFor,
  classifyVariance,
} from './view-model';
export type {
  PlanningViewModel,
  PlanningTaskRow,
  PlanningViewModelOptions,
  DelayAlert,
  ProgressVarianceStatus,
} from './view-model';
export {
  buildScheduleFromBoqPreview,
  estimateActivityDuration,
} from './generator';
export type {
  GeneratorChapterInput,
  GeneratorItemInput,
  GeneratorOptions,
  GeneratorInput,
  GeneratorPreview,
  GeneratorStats,
  GeneratorWarning,
  GeneratorWarningKind,
  GeneratorTaskType,
  ProductivitySource,
  PreviewTask,
  DurationEstimate,
} from './generator';
