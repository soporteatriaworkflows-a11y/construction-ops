/**
 * service.ts — Orquestación server-side de planificación (SCHEDULE_FROM_BOQ_V1).
 *
 * Reglas: permisos validados server-side (además del RPC/RLS); preview READ-ONLY;
 * creación atómica vía RPC; edición/dep vía RLS-bound + recálculo de fechas.
 * NO muta BOQ/APU/quantities/precios.
 */
import type { AuthenticatedViewer } from '@/server/auth/types';
import type {
  ScheduleSummary,
  ScheduleTaskView,
  DependencyView,
  MilestoneView,
  ScheduleTaskStatus,
  DependencyType,
} from '@/lib/contracts/read-model';
import type { Uuid, DecimalString } from '@/lib/utils/types';
import {
  buildScheduleFromBoqPreview,
  recalculateScheduleDates,
  dependencyWouldCreateCycle,
  isoDateToDayIndex,
  dayIndexToIsoDate,
  inclusiveDurationDays,
  type GeneratorInput,
  type GeneratorItemInput,
  type GeneratorPreview,
} from '@/modules/planning';
import {
  PlanningRepository,
  type GeneratorSourceRow,
  type ScheduleContextRow,
  type ScheduleRow,
  type ScheduleTaskRow,
} from './repository';
import { canManageSchedules, canUpdateScheduleProgress } from './permissions';
import {
  SchedulePermissionError,
  ScheduleValidationError,
  ScheduleNotFoundError,
} from './errors';
import { withOpsPerfSpan } from '@/server/performance/ops-perf';

export interface SchedulePreviewParams {
  estimateVersionId: Uuid;
  scheduleName: string;
  startDate: string;
  includeChapters: boolean;
  onlyPositiveQuantity: boolean;
  includeItemsWithoutApu: boolean;
  createChapterMilestones: boolean;
  minDurationDays: number;
  defaultCrewSize: DecimalString;
}

export interface ScheduleListItem {
  id: Uuid;
  projectId: Uuid;
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  taskCount: number;
  activityCount: number;
  progressPct: DecimalString;
  archivedAt: string | null;
}

export interface ScheduleCreationProject {
  projectId: Uuid;
  projectName: string;
  versions: { versionId: Uuid; versionNumber: number; status: string }[];
}

export interface ScheduleDetail {
  schedule: ScheduleRow;
  summary: ScheduleSummary;
  rawTasks: ScheduleTaskRow[];
  canManage: boolean;
  canSeeCriticalPath: boolean;
}

function buildGeneratorInput(
  source: GeneratorSourceRow,
  params: SchedulePreviewParams,
): GeneratorInput {
  const items: GeneratorItemInput[] = source.items.map((it) => ({
    boqItemId: it.boqItemId,
    chapterId: it.chapterId,
    code: it.code,
    description: it.description,
    unit: it.unit,
    quantity: it.quantity,
    apuTemplateId: it.apuTemplateId,
    apuLaborPersonDaysPerUnit: it.apuTemplateId
      ? source.apuLaborPersonDays.get(it.apuTemplateId) ?? null
      : null,
  }));
  return {
    chapters: source.chapters,
    items,
    options: {
      scheduleName: params.scheduleName,
      startDate: params.startDate,
      includeChapters: params.includeChapters,
      onlyPositiveQuantity: params.onlyPositiveQuantity,
      includeItemsWithoutApu: params.includeItemsWithoutApu,
      createChapterMilestones: params.createChapterMilestones,
      minDurationDays: params.minDurationDays,
      defaultCrewSize: params.defaultCrewSize,
      wbsPrefix: '',
    },
  };
}

/** Preview READ-ONLY del cronograma desde el BOQ. No escribe nada. */
export async function previewScheduleFromBoq(
  viewer: AuthenticatedViewer,
  params: SchedulePreviewParams,
  repo: PlanningRepository = new PlanningRepository(),
): Promise<GeneratorPreview> {
  if (!canManageSchedules(viewer.role)) throw new SchedulePermissionError();
  const source = await repo.loadGeneratorSource(params.estimateVersionId);
  if (!source) throw new ScheduleNotFoundError('Versión de presupuesto no encontrada.');
  return buildScheduleFromBoqPreview(buildGeneratorInput(source, params));
}

/** Crea el cronograma + tareas atómicamente. Devuelve el id del cronograma. */
export async function createScheduleFromBoq(
  viewer: AuthenticatedViewer,
  params: SchedulePreviewParams,
  repo: PlanningRepository = new PlanningRepository(),
): Promise<Uuid> {
  if (!canManageSchedules(viewer.role)) throw new SchedulePermissionError();
  const source = await repo.loadGeneratorSource(params.estimateVersionId);
  if (!source) throw new ScheduleNotFoundError('Versión de presupuesto no encontrada.');
  const preview = buildScheduleFromBoqPreview(buildGeneratorInput(source, params));
  if (preview.tasks.length === 0) {
    throw new ScheduleValidationError('El presupuesto no tiene actividades para programar.');
  }
  const res = await repo.createScheduleFromBoq({
    projectId: source.projectId,
    estimateVersionId: params.estimateVersionId,
    name: params.scheduleName,
    startDate: params.startDate,
    endDate: preview.endDate,
    status: 'draft',
    tasks: preview.tasks,
  });
  if (res.errorCode) throw mapWriteError(res.errorCode, res.errorMessage);
  return res.scheduleId;
}

/** Datos para el selector de /planning/new (proyectos × versiones). */
export async function loadScheduleCreationData(
  viewer: AuthenticatedViewer,
  repo: PlanningRepository = new PlanningRepository(),
): Promise<ScheduleCreationProject[]> {
  if (!canManageSchedules(viewer.role)) throw new SchedulePermissionError();
  const options = await repo.listProjectVersionOptions();
  const byProject = new Map<string, ScheduleCreationProject>();
  for (const o of options) {
    let p = byProject.get(o.projectId);
    if (!p) {
      p = { projectId: o.projectId, projectName: o.projectName, versions: [] };
      byProject.set(o.projectId, p);
    }
    p.versions.push({ versionId: o.versionId, versionNumber: o.versionNumber, status: o.status });
  }
  return Array.from(byProject.values()).filter((p) => p.versions.length > 0);
}

/** Lista de cronogramas con conteos y avance ponderado. */
export async function listSchedulesForViewer(
  viewer: AuthenticatedViewer,
  projectId: Uuid | undefined,
  repo: PlanningRepository = new PlanningRepository(),
): Promise<ScheduleListItem[]> {
  const schedules = await withOpsPerfSpan(
    '/planning',
    'planning.repo.listSchedules',
    () => repo.listSchedules(projectId),
    { filteredByProject: Boolean(projectId) },
  );
  return Promise.all(
    schedules.map(async (s) => {
      const tasks = await withOpsPerfSpan(
        '/planning',
        'planning.repo.listTasksForSchedule',
        () => repo.listTasks(s.id),
      );
      const activities = tasks.filter((t) => t.taskType !== 'chapter');
      return {
        id: s.id,
        projectId: s.projectId,
        name: s.name,
        status: s.status,
        startDate: s.startDate,
        endDate: s.endDate,
        taskCount: tasks.length,
        activityCount: activities.length,
        progressPct: weightedProgress(tasks),
        archivedAt: s.archivedAt,
      };
    }),
  );
}

/** Detalle de un cronograma proyectado para reusar los componentes 3B. */
export async function getScheduleDetailForViewer(
  viewer: AuthenticatedViewer,
  scheduleId: Uuid,
  repo: PlanningRepository = new PlanningRepository(),
): Promise<ScheduleDetail> {
  const schedule = await withOpsPerfSpan(
    '/planning/[scheduleId]',
    'planning.repo.getSchedule',
    () => repo.getSchedule(scheduleId),
  );
  if (!schedule) throw new ScheduleNotFoundError();
  const tasks = await withOpsPerfSpan(
    '/planning/[scheduleId]',
    'planning.repo.listTasks',
    () => repo.listTasks(scheduleId),
  );
  const deps = await withOpsPerfSpan(
    '/planning/[scheduleId]',
    'planning.repo.listDependencies',
    () => repo.listDependencies(tasks.map((t) => t.id)),
    { taskCount: tasks.length },
  );
  return {
    schedule,
    summary: toScheduleSummary(schedule, tasks, deps),
    rawTasks: tasks,
    canManage: canManageSchedules(viewer.role),
    canSeeCriticalPath: viewer.role !== 'client',
  };
}

/**
 * Contexto de negocio del cronograma para el header (P2C1): nombres de
 * proyecto/alcance/presupuesto/versión. NUNCA lanza: cualquier fallo de
 * lectura degrada a `null` y la página muestra el fallback amable
 * ("Alcance no definido"); el cronograma nunca se cae por el contexto.
 */
export async function getScheduleContextForViewer(
  estimateVersionId: Uuid,
  repo: PlanningRepository = new PlanningRepository(),
): Promise<ScheduleContextRow | null> {
  try {
    return await repo.getScheduleContext(estimateVersionId);
  } catch {
    return null;
  }
}

/** Actualiza una tarea (avance/estado y, con permiso de gestión, duración/cuadrilla). */
export async function updateScheduleTask(
  viewer: AuthenticatedViewer,
  params: {
    taskId: Uuid;
    scheduleId: Uuid;
    durationDays?: number;
    progressPct?: number;
    status?: string;
    crewLabel?: string | null;
    crewSize?: number | null;
    responsible?: string | null;
  },
  repo: PlanningRepository = new PlanningRepository(),
): Promise<void> {
  const structural =
    params.durationDays !== undefined ||
    params.crewLabel !== undefined ||
    params.crewSize !== undefined ||
    params.responsible !== undefined;
  if (structural && !canManageSchedules(viewer.role)) throw new SchedulePermissionError();
  if (!structural && !canUpdateScheduleProgress(viewer.role)) throw new SchedulePermissionError();

  const patch: Parameters<PlanningRepository['updateTask']>[1] = {};
  if (params.progressPct !== undefined) {
    if (!(params.progressPct >= 0 && params.progressPct <= 100)) {
      throw new ScheduleValidationError('El progreso debe estar entre 0 y 100.');
    }
    patch.progressPct = String(params.progressPct);
    // Estado derivado si no se especifica explícitamente.
    if (params.status === undefined) {
      patch.status =
        params.progressPct >= 100 ? 'completed' : params.progressPct > 0 ? 'in_progress' : 'not_started';
    }
  }
  if (params.status !== undefined) patch.status = params.status;
  if (params.durationDays !== undefined) {
    if (!(params.durationDays >= 1)) throw new ScheduleValidationError('La duración debe ser ≥ 1 día.');
    patch.plannedDurationDays = String(Math.floor(params.durationDays));
    // El fin se ajusta en el recálculo global (recalcAndPersist) tras el UPDATE.
  }
  if (params.crewLabel !== undefined) patch.crewLabel = params.crewLabel;
  if (params.crewSize !== undefined) patch.crewSize = params.crewSize === null ? null : String(params.crewSize);
  if (params.responsible !== undefined) patch.responsible = params.responsible;

  const res = await repo.updateTask(params.taskId, patch);
  if (res.errorCode) throw mapWriteError(res.errorCode);

  if (params.durationDays !== undefined) {
    await recalcAndPersist(params.scheduleId, repo);
  }
}

/** Agrega una dependencia entre tareas (FS/SS/FF/SF + lag), evitando ciclos. */
export async function addScheduleDependency(
  viewer: AuthenticatedViewer,
  params: {
    scheduleId: Uuid;
    predecessorTaskId: Uuid;
    successorTaskId: Uuid;
    dependencyType: DependencyType;
    lagDays: number;
  },
  repo: PlanningRepository = new PlanningRepository(),
): Promise<void> {
  if (!canManageSchedules(viewer.role)) throw new SchedulePermissionError();
  const schedule = await repo.getSchedule(params.scheduleId);
  if (!schedule) throw new ScheduleNotFoundError();
  const tasks = await repo.listTasks(params.scheduleId);
  const ids = new Set(tasks.map((t) => t.id));
  if (!ids.has(params.predecessorTaskId) || !ids.has(params.successorTaskId)) {
    throw new ScheduleValidationError('La dependencia referencia una tarea fuera del cronograma.');
  }
  if (params.predecessorTaskId === params.successorTaskId) {
    throw new ScheduleValidationError('Una tarea no puede depender de sí misma.');
  }
  const deps = await repo.listDependencies(tasks.map((t) => t.id));
  if (dependencyWouldCreateCycle(deps, params.predecessorTaskId, params.successorTaskId)) {
    throw new ScheduleValidationError('La dependencia crearía un ciclo.');
  }
  const res = await repo.insertDependency({
    projectId: schedule.projectId,
    organizationId: viewer.organizationId,
    predecessorTaskId: params.predecessorTaskId,
    successorTaskId: params.successorTaskId,
    dependencyType: params.dependencyType,
    lagDays: String(Math.floor(params.lagDays)),
  });
  if (res.errorCode) throw mapWriteError(res.errorCode);
  await recalcAndPersist(params.scheduleId, repo);
}

/** Archiva un cronograma (status=archived). */
export async function archiveScheduleForViewer(
  viewer: AuthenticatedViewer,
  scheduleId: Uuid,
  repo: PlanningRepository = new PlanningRepository(),
): Promise<void> {
  if (!canManageSchedules(viewer.role)) throw new SchedulePermissionError();
  const res = await repo.archiveSchedule(scheduleId);
  if (res.errorCode) throw mapWriteError(res.errorCode);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/** Recalcula fechas (FS/SS/FF/SF + lag) y persiste tareas + capítulos + fin. */
async function recalcAndPersist(scheduleId: Uuid, repo: PlanningRepository): Promise<void> {
  const schedule = await repo.getSchedule(scheduleId);
  if (!schedule) return;
  const tasks = await repo.listTasks(scheduleId);
  const deps = await repo.listDependencies(tasks.map((t) => t.id));
  const nonChapter = tasks.filter((t) => t.taskType !== 'chapter');
  const nonChapterIds = new Set(nonChapter.map((t) => t.id));

  let result;
  try {
    result = recalculateScheduleDates({
      scheduleStart: schedule.startDate,
      tasks: nonChapter.map((t) => ({
        id: t.id,
        durationDays: Math.round(Number(t.plannedDurationDays)),
        isMilestone: t.isMilestone,
      })),
      dependencies: deps
        .filter((d) => nonChapterIds.has(d.predecessorTaskId) && nonChapterIds.has(d.successorTaskId))
        .map((d) => ({
          predecessorTaskId: d.predecessorTaskId,
          successorTaskId: d.successorTaskId,
          dependencyType: d.dependencyType,
          lagDays: Math.round(Number(d.lagDays)),
        })),
    });
  } catch {
    // Ciclo (no debería: la inserción lo previene). Se deja el estado actual.
    return;
  }

  const byId = new Map(result.tasks.map((t) => [t.id, t]));
  for (const t of nonChapter) {
    const r = byId.get(t.id);
    if (r && (r.plannedStart !== t.plannedStart || r.plannedEnd !== t.plannedEnd)) {
      await repo.updateTask(t.id, { plannedStart: r.plannedStart, plannedEnd: r.plannedEnd });
    }
  }

  // Recomputar capítulos a partir de sus hijos (no de dependencias).
  for (const ch of tasks.filter((t) => t.taskType === 'chapter')) {
    const children = nonChapter.filter((t) => t.parentTaskId === ch.id);
    if (children.length === 0) continue;
    let minStartIdx = Number.POSITIVE_INFINITY;
    let maxEndIdx = Number.NEGATIVE_INFINITY;
    for (const c of children) {
      const r = byId.get(c.id);
      const s = isoDateToDayIndex(r?.plannedStart ?? c.plannedStart);
      const e = isoDateToDayIndex(r?.plannedEnd ?? c.plannedEnd);
      if (s < minStartIdx) minStartIdx = s;
      if (e > maxEndIdx) maxEndIdx = e;
    }
    const start = dayIndexToIsoDate(minStartIdx);
    const end = dayIndexToIsoDate(maxEndIdx);
    await repo.updateTask(ch.id, {
      plannedStart: start,
      plannedEnd: end,
      plannedDurationDays: String(inclusiveDurationDays(start, end)),
    });
  }

  await repo.setScheduleEndDate(scheduleId, result.scheduleEnd);
}

/** Avance ponderado por duración de las tareas hoja (no capítulos, no hitos). */
function weightedProgress(tasks: ScheduleTaskRow[]): DecimalString {
  let num = 0;
  let den = 0;
  for (const t of tasks) {
    if (t.taskType === 'chapter' || t.isMilestone) continue;
    const dur = Number(t.plannedDurationDays);
    const prog = Number(t.progressPct);
    if (!Number.isFinite(dur) || dur <= 0) continue;
    num += dur * prog;
    den += dur;
  }
  if (den === 0) return '0';
  return (num / den).toFixed(2);
}

/**
 * Quita el prefijo técnico del `wbs_code` (token de unicidad por cronograma,
 * `^[0-9a-f]{6}\.`) para mostrar el código limpio (p. ej. `01.001`).
 */
export function displayWbs(wbs: string): string {
  return wbs.replace(/^[0-9a-f]{6}\./, '');
}

function toScheduleSummary(
  schedule: ScheduleRow,
  tasks: ScheduleTaskRow[],
  deps: { predecessorTaskId: Uuid; successorTaskId: Uuid; dependencyType: DependencyType; lagDays: DecimalString }[],
): ScheduleSummary {
  const taskViews: ScheduleTaskView[] = tasks.map((t) => ({
    id: t.id,
    wbsCode: displayWbs(t.wbsCode),
    name: t.name,
    parentTaskId: t.parentTaskId,
    plannedStart: t.plannedStart,
    plannedEnd: t.plannedEnd,
    plannedDurationDays: t.plannedDurationDays,
    progressPct: t.progressPct,
    status: t.status as ScheduleTaskStatus,
    isMilestone: t.isMilestone,
    sortOrder: t.sortOrder,
  }));
  const dependencyViews: DependencyView[] = deps.map((d) => ({
    predecessorTaskId: d.predecessorTaskId,
    successorTaskId: d.successorTaskId,
    dependencyType: d.dependencyType,
    lagDays: d.lagDays,
  }));
  const milestones: MilestoneView[] = tasks
    .filter((t) => t.isMilestone)
    .map((t) => ({
      id: t.id,
      name: t.name,
      date: t.plannedStart,
      status: t.status as ScheduleTaskStatus,
    }));
  return {
    projectId: schedule.projectId,
    tasks: taskViews,
    dependencies: dependencyViews,
    milestones,
    physicalProgressPct: weightedProgress(tasks),
  };
}

function mapWriteError(code: string, message?: string): Error {
  const msg = message ?? '';
  if (code === '42501' || msg.includes('insufficient_role') || msg.includes('no_membership')) {
    return new SchedulePermissionError();
  }
  // SQLSTATE 22000 (data exception) and 23xxx (integrity constraint) are always
  // validation failures from the RPC or DB constraints — never silent/unknown.
  if (code === '22000' || code.startsWith('23') || msg.includes('invalid_') || msg.includes('not_found')) {
    const detail = msg && msg !== code ? msg : code;
    return mapRpcValidationMessage(detail, code);
  }
  // PostgREST errors (PGRST*) and other unrecognized codes surface as validation
  // with a safe code for debugging; never swallowed silently.
  return new ScheduleValidationError(`No se pudo crear el cronograma. Código: SCHEDULE_CREATE_VALIDATION (${code}).`);
}

/** Convierte el mensaje del RPC en un error de validación con texto útil para el usuario. */
function mapRpcValidationMessage(msg: string, code: string): ScheduleValidationError {
  if (msg.includes('invalid_tasks') || msg === 'invalid_tasks') {
    return new ScheduleValidationError('El cronograma no tiene tareas válidas para crear.');
  }
  if (msg.includes('invalid_start_date') || msg === 'invalid_start_date') {
    return new ScheduleValidationError('La fecha de inicio no es válida.');
  }
  if (msg.includes('invalid_project_or_version') || msg.includes('estimate_version_not_found') || msg.includes('project_not_found')) {
    return new ScheduleValidationError('El proyecto y la versión seleccionados no coinciden o no pertenecen a tu organización.');
  }
  if (msg.includes('invalid_schedule_payload') || msg.includes('invalid_status') || msg.includes('invalid_name')) {
    return new ScheduleValidationError('La información del cronograma está incompleta o no es válida.');
  }
  return new ScheduleValidationError(`No se pudo completar la operación. Código: ${code}.`);
}
