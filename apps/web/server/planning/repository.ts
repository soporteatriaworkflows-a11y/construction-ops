/**
 * repository.ts — Acceso a datos de planificación (SCHEDULE_FROM_BOQ_V1).
 *
 * Cliente RLS-bound (`createClient()`), NUNCA service-role. org/actor server-side.
 * Lecturas: proyectos/versiones para el selector, fuente del generador (capítulos
 * + ítems BOQ + rendimiento APU laboral). Escrituras: RPC atómica
 * `create_schedule_from_boq` (creación) y UPDATE/INSERT RLS-bound (edición/deps).
 * NO muta BOQ/APU/quantities/precios (solo lee).
 */
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecimalString, Uuid } from '@/lib/utils/types';
import { type PreviewTask, toNonNegativeDecimalString, addDecimalStrings } from '@/modules/planning';

export interface ProjectVersionOption {
  projectId: Uuid;
  projectName: string;
  versionId: Uuid;
  versionNumber: number;
  status: string;
}

export interface GeneratorSourceRow {
  chapters: { id: Uuid; code: string; name: string; sortOrder: number }[];
  items: {
    boqItemId: Uuid;
    chapterId: Uuid;
    code: string;
    description: string;
    unit: string;
    quantity: DecimalString;
    apuTemplateId: Uuid | null;
  }[];
  /** apu_template_id → Σ(quantity de componentes labor) = persona·días por unidad. */
  apuLaborPersonDays: Map<Uuid, DecimalString>;
  projectId: Uuid;
}

export interface ScheduleRow {
  id: Uuid;
  projectId: Uuid;
  estimateVersionId: Uuid;
  name: string;
  status: string;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface ScheduleTaskRow {
  id: Uuid;
  scheduleId: Uuid | null;
  parentTaskId: Uuid | null;
  chapterId: Uuid | null;
  boqItemId: Uuid | null;
  apuTemplateId: Uuid | null;
  taskType: string | null;
  wbsCode: string;
  name: string;
  unitSnapshot: string | null;
  quantitySnapshot: DecimalString | null;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationDays: DecimalString;
  progressPct: DecimalString;
  status: string;
  isMilestone: boolean;
  productivitySource: string | null;
  crewLabel: string | null;
  crewSize: DecimalString | null;
  responsible: string | null;
  sortOrder: number;
}

export interface DependencyRow {
  predecessorTaskId: Uuid;
  successorTaskId: Uuid;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: DecimalString;
}

export class PlanningRepository {
  private readonly clientFactory: () => Promise<SupabaseClient>;

  constructor(clientFactory: () => Promise<SupabaseClient> = createClient) {
    this.clientFactory = clientFactory;
  }

  /** Proyectos × versiones de presupuesto de la organización (selector /planning/new). */
  async listProjectVersionOptions(): Promise<ProjectVersionOption[]> {
    const supabase = await this.clientFactory();
    const [{ data: projects, error: pErr }, { data: scopes, error: sErr }, { data: estimates, error: eErr }, { data: versions, error: vErr }] =
      await Promise.all([
        supabase.from('projects').select('id, name').order('name', { ascending: true }),
        supabase.from('project_scopes').select('id, project_id'),
        supabase.from('estimates').select('id, project_scope_id'),
        supabase.from('estimate_versions').select('id, estimate_id, version_number, status'),
      ]);
    if (pErr) throw new Error(`planning_projects_read_failed: ${pErr.code ?? 'unknown'}`);
    if (sErr) throw new Error(`planning_scopes_read_failed: ${sErr.code ?? 'unknown'}`);
    if (eErr) throw new Error(`planning_estimates_read_failed: ${eErr.code ?? 'unknown'}`);
    if (vErr) throw new Error(`planning_versions_read_failed: ${vErr.code ?? 'unknown'}`);

    const projectName = new Map<string, string>();
    for (const p of (projects ?? []) as { id: string; name: string }[]) projectName.set(p.id, p.name);
    const scopeProject = new Map<string, string>();
    for (const s of (scopes ?? []) as { id: string; project_id: string }[]) scopeProject.set(s.id, s.project_id);
    const estimateProject = new Map<string, string>();
    for (const e of (estimates ?? []) as { id: string; project_scope_id: string }[]) {
      const projId = scopeProject.get(e.project_scope_id);
      if (projId) estimateProject.set(e.id, projId);
    }

    const out: ProjectVersionOption[] = [];
    for (const v of (versions ?? []) as { id: string; estimate_id: string; version_number: number; status: string }[]) {
      const projId = estimateProject.get(v.estimate_id);
      if (!projId) continue;
      out.push({
        projectId: projId,
        projectName: projectName.get(projId) ?? 'Proyecto',
        versionId: v.id,
        versionNumber: v.version_number,
        status: v.status,
      });
    }
    return out;
  }

  /** Capítulos + ítems BOQ + rendimiento APU laboral de una versión (fuente del generador). */
  async loadGeneratorSource(estimateVersionId: Uuid): Promise<GeneratorSourceRow | null> {
    const supabase = await this.clientFactory();

    // Proyecto de la versión (vía estimate → scope → project).
    const { data: ver, error: verErr } = await supabase
      .from('estimate_versions')
      .select('id, estimate_id, estimates(project_scope_id, project_scopes(project_id))')
      .eq('id', estimateVersionId)
      .maybeSingle();
    if (verErr) throw new Error(`planning_version_read_failed: ${verErr.code ?? 'unknown'}`);
    if (!ver) return null;
    const est = (ver as { estimates?: { project_scopes?: { project_id?: string } } }).estimates;
    const projectId = est?.project_scopes?.project_id;
    if (!projectId) return null;

    const [{ data: chapters, error: cErr }, { data: items, error: iErr }] = await Promise.all([
      supabase
        .from('chapters')
        .select('id, code, name, sort_order')
        .eq('estimate_version_id', estimateVersionId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('boq_items')
        .select('id, chapter_id, code, description_snapshot, unit_snapshot, quantity_snapshot, apu_template_id, sort_order')
        .eq('estimate_version_id', estimateVersionId)
        .order('sort_order', { ascending: true }),
    ]);
    if (cErr) throw new Error(`planning_chapters_read_failed: ${cErr.code ?? 'unknown'}`);
    if (iErr) throw new Error(`planning_boq_read_failed: ${iErr.code ?? 'unknown'}`);

    // `numeric` puede llegar como número JS o string desde PostgREST; los loaders
    // probados (quantity-workspace) lo coercen con String(...). Aquí lo tipamos
    // laxo y lo saneamos abajo para que el dominio puro reciba SIEMPRE strings.
    const itemRows = (items ?? []) as {
      id: string;
      chapter_id: string;
      code: string;
      description_snapshot: string | null;
      unit_snapshot: string | null;
      quantity_snapshot: string | number | null;
      apu_template_id: string | null;
    }[];

    // Rendimiento laboral por APU: Σ(quantity) de componentes labor.
    const apuIds = Array.from(
      new Set(itemRows.map((r) => r.apu_template_id).filter((x): x is string => !!x)),
    );
    const apuLaborPersonDays = new Map<string, string>();
    if (apuIds.length > 0) {
      const { data: comps, error: compErr } = await supabase
        .from('apu_components')
        .select('apu_template_id, quantity')
        .eq('component_type', 'labor')
        .in('apu_template_id', apuIds);
      if (compErr) throw new Error(`planning_apu_components_read_failed: ${compErr.code ?? 'unknown'}`);
      for (const c of (comps ?? []) as { apu_template_id: string; quantity: string | number | null }[]) {
        // `quantity` puede llegar como número JS; se coerce a DecimalString seguro
        // antes de sumar (la suma usa Decimal, no string.split() — V4 root cause).
        const qty = toNonNegativeDecimalString(c.quantity);
        const prev = apuLaborPersonDays.get(c.apu_template_id);
        apuLaborPersonDays.set(c.apu_template_id, prev ? addDecimalStrings(prev, qty) : qty);
      }
    }

    return {
      projectId,
      chapters: ((chapters ?? []) as { id: string; code: string; name: string; sort_order: number }[]).map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        sortOrder: c.sort_order,
      })),
      items: itemRows.map((r) => ({
        boqItemId: r.id,
        chapterId: r.chapter_id,
        code: r.code,
        description: r.description_snapshot ?? '',
        unit: r.unit_snapshot ?? '',
        // numeric → DecimalString seguro (nunca número JS crudo en el dominio puro).
        quantity: toNonNegativeDecimalString(r.quantity_snapshot),
        apuTemplateId: r.apu_template_id,
      })),
      apuLaborPersonDays,
    };
  }

  /** Crea el cronograma + tareas atómicamente vía RPC. Devuelve el id. */
  async createScheduleFromBoq(params: {
    projectId: Uuid;
    estimateVersionId: Uuid;
    name: string;
    startDate: string;
    endDate: string | null;
    status: string;
    tasks: PreviewTask[];
  }): Promise<{ scheduleId: Uuid; errorCode?: string; errorMessage?: string }> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase.rpc('create_schedule_from_boq', {
      p_project_id: params.projectId,
      p_estimate_version_id: params.estimateVersionId,
      p_name: params.name,
      p_start_date: params.startDate,
      p_end_date: params.endDate,
      p_status: params.status,
      p_tasks: params.tasks,
    });
    if (error) {
      return { scheduleId: '', errorCode: error.code ?? error.message, errorMessage: error.message };
    }
    return { scheduleId: data as string };
  }

  async listSchedules(projectId?: Uuid): Promise<ScheduleRow[]> {
    const supabase = await this.clientFactory();
    let q = supabase
      .from('planning_schedules')
      .select('id, project_id, estimate_version_id, name, status, start_date, end_date, created_at, archived_at')
      .order('created_at', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) throw new Error(`planning_schedules_read_failed: ${error.code ?? 'unknown'}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapScheduleRow);
  }

  async getSchedule(scheduleId: Uuid): Promise<ScheduleRow | null> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('planning_schedules')
      .select('id, project_id, estimate_version_id, name, status, start_date, end_date, created_at, archived_at')
      .eq('id', scheduleId)
      .maybeSingle();
    if (error) throw new Error(`planning_schedule_read_failed: ${error.code ?? 'unknown'}`);
    return data ? mapScheduleRow(data as Record<string, unknown>) : null;
  }

  async listTasks(scheduleId: Uuid): Promise<ScheduleTaskRow[]> {
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('schedule_tasks')
      .select(
        'id, schedule_id, parent_task_id, chapter_id, boq_item_id, apu_template_id, task_type, wbs_code, name, unit_snapshot, quantity_snapshot, planned_start, planned_end, planned_duration_days, progress_pct, status, is_milestone, productivity_source, crew_label, crew_size, responsible, sort_order',
      )
      .eq('schedule_id', scheduleId)
      .order('sort_order', { ascending: true });
    if (error) throw new Error(`planning_tasks_read_failed: ${error.code ?? 'unknown'}`);
    return ((data ?? []) as Record<string, unknown>[]).map(mapTaskRow);
  }

  async listDependencies(taskIds: Uuid[]): Promise<DependencyRow[]> {
    if (taskIds.length === 0) return [];
    const supabase = await this.clientFactory();
    const { data, error } = await supabase
      .from('task_dependencies')
      .select('predecessor_task_id, successor_task_id, dependency_type, lag_days')
      .in('predecessor_task_id', taskIds);
    if (error) throw new Error(`planning_deps_read_failed: ${error.code ?? 'unknown'}`);
    return ((data ?? []) as Record<string, unknown>[])
      .map((r) => ({
        predecessorTaskId: r.predecessor_task_id as string,
        successorTaskId: r.successor_task_id as string,
        dependencyType: r.dependency_type as 'FS' | 'SS' | 'FF' | 'SF',
        lagDays: r.lag_days as string,
      }))
      // Solo deps cuyos dos extremos están en el cronograma.
      .filter((d) => taskIds.includes(d.successorTaskId));
  }

  /** Actualiza campos editables de una tarea (RLS UPDATE por org). */
  async updateTask(
    taskId: Uuid,
    patch: Partial<{
      plannedStart: string;
      plannedEnd: string;
      plannedDurationDays: string;
      progressPct: string;
      status: string;
      crewLabel: string | null;
      crewSize: string | null;
      responsible: string | null;
    }>,
  ): Promise<{ errorCode?: string }> {
    const supabase = await this.clientFactory();
    const row: Record<string, unknown> = {};
    if (patch.plannedStart !== undefined) row.planned_start = patch.plannedStart;
    if (patch.plannedEnd !== undefined) row.planned_end = patch.plannedEnd;
    if (patch.plannedDurationDays !== undefined) row.planned_duration_days = patch.plannedDurationDays;
    if (patch.progressPct !== undefined) row.progress_pct = patch.progressPct;
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.crewLabel !== undefined) row.crew_label = patch.crewLabel;
    if (patch.crewSize !== undefined) row.crew_size = patch.crewSize;
    if (patch.responsible !== undefined) row.responsible = patch.responsible;
    if (Object.keys(row).length === 0) return {};
    const { error } = await supabase.from('schedule_tasks').update(row).eq('id', taskId);
    if (error) return { errorCode: error.code ?? error.message };
    return {};
  }

  /** Inserta una dependencia (RLS INSERT por org + coherencia de tareas). */
  async insertDependency(params: {
    projectId: Uuid;
    organizationId: Uuid;
    predecessorTaskId: Uuid;
    successorTaskId: Uuid;
    dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
    lagDays: string;
  }): Promise<{ errorCode?: string }> {
    const supabase = await this.clientFactory();
    const { error } = await supabase.from('task_dependencies').insert({
      organization_id: params.organizationId,
      project_id: params.projectId,
      predecessor_task_id: params.predecessorTaskId,
      successor_task_id: params.successorTaskId,
      dependency_type: params.dependencyType,
      lag_days: params.lagDays,
    });
    if (error) return { errorCode: error.code ?? error.message };
    return {};
  }

  /** Archiva el cronograma (status='archived' + archived_at). */
  async archiveSchedule(scheduleId: Uuid): Promise<{ errorCode?: string }> {
    const supabase = await this.clientFactory();
    const { error } = await supabase
      .from('planning_schedules')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', scheduleId);
    if (error) return { errorCode: error.code ?? error.message };
    return {};
  }

  /** Actualiza la fecha fin del cronograma (derivada del recálculo). */
  async setScheduleEndDate(scheduleId: Uuid, endDate: string): Promise<void> {
    const supabase = await this.clientFactory();
    await supabase.from('planning_schedules').update({ end_date: endDate }).eq('id', scheduleId);
  }
}

function mapScheduleRow(r: Record<string, unknown>): ScheduleRow {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    estimateVersionId: r.estimate_version_id as string,
    name: r.name as string,
    status: r.status as string,
    startDate: r.start_date as string,
    endDate: (r.end_date as string | null) ?? null,
    createdAt: r.created_at as string,
    archivedAt: (r.archived_at as string | null) ?? null,
  };
}

function mapTaskRow(r: Record<string, unknown>): ScheduleTaskRow {
  return {
    id: r.id as string,
    scheduleId: (r.schedule_id as string | null) ?? null,
    parentTaskId: (r.parent_task_id as string | null) ?? null,
    chapterId: (r.chapter_id as string | null) ?? null,
    boqItemId: (r.boq_item_id as string | null) ?? null,
    apuTemplateId: (r.apu_template_id as string | null) ?? null,
    taskType: (r.task_type as string | null) ?? null,
    wbsCode: r.wbs_code as string,
    name: r.name as string,
    unitSnapshot: (r.unit_snapshot as string | null) ?? null,
    quantitySnapshot: (r.quantity_snapshot as string | null) ?? null,
    plannedStart: r.planned_start as string,
    plannedEnd: r.planned_end as string,
    plannedDurationDays: r.planned_duration_days as string,
    progressPct: r.progress_pct as string,
    status: r.status as string,
    isMilestone: r.is_milestone as boolean,
    productivitySource: (r.productivity_source as string | null) ?? null,
    crewLabel: (r.crew_label as string | null) ?? null,
    crewSize: (r.crew_size as string | null) ?? null,
    responsible: (r.responsible as string | null) ?? null,
    sortOrder: r.sort_order as number,
  };
}
