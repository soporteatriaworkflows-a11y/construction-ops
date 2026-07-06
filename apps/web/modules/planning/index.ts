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
  tryDecimal,
  toNonNegativeDecimalString,
  addDecimalStrings,
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
  shortGanttLabel,
  fullGanttLabel,
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
export {
  recalculateScheduleDates,
  dependencyWouldCreateCycle,
} from './recalc';
export type {
  RecalcTaskInput,
  RecalcDependency,
  RecalcTaskResult,
  RecalcResult,
} from './recalc';
export {
  clampGanttZoom,
  ganttZoomIn,
  ganttZoomOut,
  ganttColumnWidth,
  ganttRangeDays,
  ganttFitZoom,
  ganttContainerHeight,
  pickDefaultViewMode,
  GANTT_ZOOM_MIN_BY_MODE,
  GANTT_ZOOM_MAX,
  GANTT_ZOOM_STEP,
  GANTT_ZOOM_DEFAULT,
  GANTT_DEFAULT_MODE_WEEK_MAX_DAYS,
  GANTT_BASE_COLUMN_WIDTH,
  GANTT_DAYS_PER_COLUMN,
  GANTT_VIEWPORT_MIN_HEIGHT,
  GANTT_VIEWPORT_MAX_HEIGHT,
} from './gantt-zoom';
export type { GanttZoomViewMode } from './gantt-zoom';
export {
  DURATION_CATEGORIES,
  classifyActivityDurationCategory,
  evaluateActivityDuration,
  getDurationWarningCopy,
  buildScheduleDurationReport,
} from './duration-criteria';
export type {
  DurationCategory,
  DurationCategoryKey,
  DurationVerdict,
  DurationReportTask,
  DurationReportItem,
  ScheduleDurationReport,
} from './duration-criteria';
