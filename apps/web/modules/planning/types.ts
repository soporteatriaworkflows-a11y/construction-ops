/**
 * types.ts — Tipos del dominio de planificación (Oleada 3B).
 *
 * Propiedad: agent-planning. Espejo EXACTO de `docs/PLANNING_CONTRACT.md §2`
 * (dominio puro) y `§3` (DTOs del read-model). NO inventa campos.
 *
 * IMPORTANTE (paralelización): db-rls añade en su worktree el read-model de
 * planning (`getSchedule`) y los DTOs en `@/lib/contracts/read-model`. Mientras
 * eso no esté en este worktree, agent-planning declara aquí los DTOs con la
 * forma EXACTA del contrato para compilar. El orquestador deduplicará en
 * integración (canónico = db-rls / contrato congelado).
 */

import type {
  DecimalString,
  IsoDate,
  IsoDateTime,
  Uuid,
} from '@/lib/utils/types';

export type {
  DecimalString,
  IsoDate,
  IsoDateTime,
  Uuid,
} from '@/lib/utils/types';

/* ----------------------------------------------------------------------------
 * Enums (espejo de los CHECK de la DB — PLANNING_CONTRACT §1.5)
 * ------------------------------------------------------------------------- */

/** Estado de una tarea de cronograma. */
export type ScheduleTaskStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled';

/**
 * Tipo de dependencia entre tareas (precedence relationships):
 *  - `FS` Finish-to-Start: el sucesor inicia cuando termina el predecesor.
 *  - `SS` Start-to-Start: el sucesor inicia cuando inicia el predecesor.
 *  - `FF` Finish-to-Finish: el sucesor termina cuando termina el predecesor.
 *  - `SF` Start-to-Finish: el sucesor termina cuando inicia el predecesor.
 */
export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

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

/* ----------------------------------------------------------------------------
 * DTOs del read-model (PLANNING_CONTRACT §3) — declarados aquí mientras db-rls
 * no los publique en `@/lib/contracts/read-model`. Forma EXACTA del contrato.
 * El orquestador deduplica en integración (canónico = db-rls).
 * ------------------------------------------------------------------------- */

/** Tarea proyectada para la UI. Campos 🔒 omitidos para rol `client`. */
export interface ScheduleTaskView {
  id: Uuid;
  wbsCode: string;
  name: string;
  parentTaskId?: Uuid | null;
  plannedStart: IsoDate;
  plannedEnd: IsoDate;
  plannedDurationDays: DecimalString;
  progressPct: DecimalString;
  status: ScheduleTaskStatus;
  isMilestone: boolean;
  sortOrder: number;
  // 🔒 (omitidos para client):
  totalFloatDays?: DecimalString;
  freeFloatDays?: DecimalString;
  isCritical?: boolean;
  financialProgressPct?: DecimalString;
}

/** Dependencia proyectada para la UI. */
export interface DependencyView {
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: DependencyType;
  lagDays: DecimalString;
}

/** Hito proyectado para la UI. */
export interface MilestoneView {
  id: Uuid;
  name: string;
  date: IsoDate;
  status: ScheduleTaskStatus;
}

/** Registro de avance proyectado para la UI (campos 🔒 omitidos). */
export interface ProgressEntryView {
  id: Uuid;
  taskId: Uuid;
  recordedAt: IsoDateTime;
  physicalProgressPct: DecimalString;
  // 🔒 financialProgressPct?, notes?
}

/** Asignación de recurso proyectada para la UI (internos 🔒). */
export interface ResourceAssignmentView {
  id: Uuid;
  taskId: Uuid;
  resourceName?: string | null;
  laborRoleName?: string | null;
  quantity?: DecimalString | null;
  unit?: string | null;
}

/** Resumen de ruta crítica para la UI (🔒 management/internal). */
export interface CriticalPathSummary {
  criticalTaskIds: Uuid[];
  projectStart: IsoDate;
  projectEnd: IsoDate;
  durationDays: DecimalString;
}

/** Resumen de cronograma del read-model (DTO consumido por la página). */
export interface ScheduleSummaryView {
  projectId: Uuid;
  tasks: ScheduleTaskView[];
  dependencies: DependencyView[];
  milestones: MilestoneView[];
  physicalProgressPct: DecimalString;
  /** 🔒 management/internal; omitido para `client`. */
  criticalPath?: CriticalPathSummary;
}
