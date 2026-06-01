/**
 * types.ts — Tipos del dominio de planificación (Oleada 3B).
 *
 * Propiedad: agent-planning. Espejo de `docs/PLANNING_CONTRACT.md §2` (dominio
 * puro). NO inventa campos.
 *
 * B-005 (resuelto 2026-06-01): los DTOs del read-model (`ScheduleTaskView`,
 * `DependencyView`, `MilestoneView`, `ProgressEntryView`,
 * `ResourceAssignmentView`, `CriticalPathSummary`) y los enums compartidos
 * (`ScheduleTaskStatus`, `DependencyType`) tienen FUENTE ÚNICA en
 * `@/lib/contracts/read-model`. Este archivo los re-exporta (sin redeclararlos)
 * para conservar estable la superficie de `@/modules/planning`, y define
 * exclusivamente los tipos de dominio puro (entrada/salida del CPM).
 */

import type {
  DecimalString,
  IsoDate,
  IsoDateTime,
  Uuid,
} from '@/lib/utils/types';
// Enums compartidos con la DB/read-model: FUENTE ÚNICA en el contrato canónico
// (B-005 resuelto 2026-06-01). Se importan aquí para tipar el dominio puro.
import type {
  ScheduleTaskStatus,
  DependencyType,
} from '@/lib/contracts/read-model';

export type {
  DecimalString,
  IsoDate,
  IsoDateTime,
  Uuid,
} from '@/lib/utils/types';

/* ----------------------------------------------------------------------------
 * Enums y DTOs del read-model — FUENTE ÚNICA en `@/lib/contracts/read-model`
 * (B-005 resuelto 2026-06-01). El dominio los consume del contrato canónico;
 * ya no se redeclaran aquí. Se re-exportan para mantener estable la superficie
 * pública de `@/modules/planning` (consumida por componentes y la página).
 * ------------------------------------------------------------------------- */

export type {
  ScheduleTaskStatus,
  DependencyType,
  ScheduleTaskView,
  DependencyView,
  MilestoneView,
  ProgressEntryView,
  ResourceAssignmentView,
  CriticalPathSummary,
} from '@/lib/contracts/read-model';

/* ----------------------------------------------------------------------------
 * Tipos de dominio puro (PLANNING_CONTRACT §2)
 * ------------------------------------------------------------------------- */

/** Tarea de cronograma (entrada al dominio; espejo de `schedule_tasks`). */
export interface PlanningTask {
  id: Uuid;
  projectId: Uuid;
  projectScopeId?: Uuid | null;
  chapterId?: Uuid | null;
  parentTaskId?: Uuid | null;
  wbsCode: string;
  name: string;
  description?: string | null;
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

/** Dependencia entre tareas (espejo de `task_dependencies`). */
export interface TaskDependency {
  id: Uuid;
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: DependencyType;
  /** Holgura/lead de la dependencia en días (puede ser negativo). */
  lagDays: DecimalString;
}

/** Registro de avance físico (append-only; espejo de `progress_entries`). */
export interface ProgressEntry {
  id: Uuid;
  taskId: Uuid;
  recordedAt: IsoDateTime;
  physicalProgressPct: DecimalString;
  /** 🔒 derivado server-side desde BOQ/capítulos. */
  financialProgressPct?: DecimalString | null;
  /** 🔒 */
  notes?: string | null;
  /** 🔒 responsable. */
  createdBy?: Uuid | null;
}

/** Asignación de recurso a una tarea (espejo de `resource_assignments`). */
export interface ResourceAssignment {
  id: Uuid;
  taskId: Uuid;
  resourceId?: Uuid | null;
  laborRoleId?: Uuid | null;
  quantity?: DecimalString | null;
  unit?: string | null;
  /** 🔒 */
  notes?: string | null;
}

/** Holgura calculada de una tarea (CPM). */
export interface TaskFloat {
  taskId: Uuid;
  /** Holgura total: cuánto puede retrasarse sin afectar el fin de proyecto. */
  totalFloatDays: DecimalString;
  /** Holgura libre: cuánto puede retrasarse sin afectar a sus sucesores. */
  freeFloatDays: DecimalString;
  /** `true` ⇔ holgura total = 0 (tarea crítica). */
  isCritical: boolean;
}

/** Resultado del Critical Path Method (ruta crítica + holguras). */
export interface CriticalPathResult {
  criticalTaskIds: Uuid[];
  taskFloat: TaskFloat[];
  projectStart: IsoDate;
  projectEnd: IsoDate;
  durationDays: DecimalString;
}

/** Resumen de cronograma del dominio (datos puros, antes de proyectar por rol). */
export interface ScheduleSummary {
  projectId: Uuid;
  tasks: PlanningTask[];
  dependencies: TaskDependency[];
  criticalPath: CriticalPathResult;
  /** Avance físico agregado del proyecto (ponderado por duración planificada). */
  physicalProgressPct: DecimalString;
}

/* ----------------------------------------------------------------------------
 * Errores de dominio (PLANNING_CONTRACT §2)
 * ------------------------------------------------------------------------- */

/** Clase de error de dominio para discriminar el motivo. */
export type PlanningErrorKind =
  | 'cycle'
  | 'invalid_dependency'
  | 'invalid_dates'
  | 'invalid_progress'
  | 'invalid_duration'
  | 'unknown_task'
  | 'invalid_milestone';

/**
 * Error de dominio de planificación. `kind` discrimina el motivo para que la
 * capa server-side/UI reaccione adecuadamente.
 */
export class PlanningError extends Error {
  readonly kind: PlanningErrorKind;
  /** IDs de tareas involucradas (ej. el ciclo detectado). */
  readonly taskIds?: Uuid[];

  constructor(kind: PlanningErrorKind, message: string, taskIds?: Uuid[]) {
    super(message);
    this.name = 'PlanningError';
    this.kind = kind;
    this.taskIds = taskIds;
    // Mantiene la cadena de prototipos correcta al extender Error.
    Object.setPrototypeOf(this, PlanningError.prototype);
  }
}
