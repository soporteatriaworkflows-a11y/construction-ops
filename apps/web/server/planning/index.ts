/**
 * index.ts — Barril público del dominio server-side de planificación.
 * (SCHEDULE_FROM_BOQ_V1). Consumido por las Server Actions y las páginas.
 */
export {
  previewScheduleFromBoq,
  createScheduleFromBoq,
  loadScheduleCreationData,
  listSchedulesForViewer,
  getScheduleDetailForViewer,
  updateScheduleTask,
  addScheduleDependency,
  archiveScheduleForViewer,
  displayWbs,
} from './service';
export type {
  SchedulePreviewParams,
  ScheduleListItem,
  ScheduleCreationProject,
  ScheduleDetail,
} from './service';
export {
  canManageSchedules,
  canUpdateScheduleProgress,
  canViewSchedules,
} from './permissions';
export {
  SchedulePermissionError,
  ScheduleValidationError,
  ScheduleWriteNotSupportedError,
  ScheduleNotFoundError,
} from './errors';
export { PlanningRepository } from './repository';
export type {
  ScheduleRow,
  ScheduleTaskRow,
  GeneratorSourceRow,
  ProjectVersionOption,
} from './repository';
