/**
 * schedule-workspace-filter.ts — Lógica PURA del workspace de cronograma
 * (SCHEDULE_WORKSPACE_UX_V1, Fase 1). Sin React, sin DOM: testeable en node.
 *
 * Solo presentación: agrupa por capítulo y filtra por búsqueda/estado/rendimiento.
 * NO recalcula fechas, duración, ni nada del motor; opera sobre datos ya dados.
 */
import type { ScheduleTaskStatus } from '@/modules/planning';

export interface WorkspaceTask {
  id: string;
  wbsCode: string;
  name: string;
  parentTaskId: string | null;
  taskType: 'chapter' | 'activity' | 'milestone' | null;
  isMilestone: boolean;
  plannedStart: string;
  plannedEnd: string;
  plannedDurationDays: string;
  progressPct: string;
  status: ScheduleTaskStatus;
  varianceStatus: 'ahead' | 'on_track' | 'behind';
  totalFloatDays?: string;
  isCritical?: boolean;
  /** 'apu' | 'manual' | 'unknown' | null (capítulos/hitos). */
  productivitySource: string | null;
  apuTemplateId: string | null;
  boqItemId: string | null;
  /** Campos de detalle (panel maestro-detalle V2; presentación). */
  chapterName?: string | null;
  responsible?: string | null;
  crewLabel?: string | null;
  crewSize?: string | null;
  quantitySnapshot?: string | null;
  unitSnapshot?: string | null;
}

/** Agregado de un capítulo para la cabecera (solo presentación, no financiero). */
export interface ChapterAggregate {
  total: number;
  completed: number;
  withWarnings: number;
  /** Avance ponderado por duración de las actividades (0..100), redondeado. */
  progressPct: number;
}

export function chapterAggregate(children: WorkspaceTask[]): ChapterAggregate {
  let total = 0;
  let completed = 0;
  let withWarnings = 0;
  let num = 0;
  let den = 0;
  for (const c of children) {
    total += 1;
    if (c.status === 'completed') completed += 1;
    if (c.productivitySource === 'manual' || c.productivitySource === 'unknown') withWarnings += 1;
    if (!c.isMilestone) {
      const dur = Number(c.plannedDurationDays);
      const prog = Number(c.progressPct);
      if (Number.isFinite(dur) && dur > 0 && Number.isFinite(prog)) {
        num += dur * prog;
        den += dur;
      }
    }
  }
  const progressPct = den > 0 ? Math.round(num / den) : 0;
  return { total, completed, withWarnings, progressPct };
}

export type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'completed' | 'delayed';
export type ProductivityFilter = 'all' | 'apu' | 'manual' | 'unknown';

export interface WorkspaceFilters {
  search: string;
  status: StatusFilter;
  productivity: ProductivityFilter;
}

export interface ChapterGroup {
  id: string;
  wbsCode: string;
  name: string;
  children: WorkspaceTask[];
}

export const SYNTHETIC_CHAPTER = '__sin_capitulo__';

/** Una tarea hoja está atrasada si su avance real va por detrás del esperado. */
export function isDelayed(t: WorkspaceTask): boolean {
  return t.varianceStatus === 'behind' && !t.isMilestone;
}

/** Agrupa las tareas por capítulo padre, preservando el orden recibido. */
export function groupByChapter(tasks: WorkspaceTask[]): ChapterGroup[] {
  const chapters = tasks.filter((t) => t.taskType === 'chapter');
  const chapterIds = new Set(chapters.map((c) => c.id));
  const groups: ChapterGroup[] = chapters.map((c) => ({
    id: c.id,
    wbsCode: c.wbsCode,
    name: c.name,
    children: [],
  }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  let orphan: ChapterGroup | null = null;
  for (const t of tasks) {
    if (t.taskType === 'chapter') continue;
    const parent = t.parentTaskId && chapterIds.has(t.parentTaskId) ? byId.get(t.parentTaskId) : undefined;
    if (parent) {
      parent.children.push(t);
    } else {
      if (!orphan) {
        orphan = { id: SYNTHETIC_CHAPTER, wbsCode: '—', name: 'Sin capítulo', children: [] };
      }
      orphan.children.push(t);
    }
  }
  if (orphan) groups.push(orphan);
  return groups;
}

/** `true` si hay algún filtro activo (búsqueda/capítulo/estado/rendimiento). */
export function filtersActive(filters: WorkspaceFilters, chapterFilter: string): boolean {
  return (
    filters.search.trim() !== '' ||
    chapterFilter !== 'all' ||
    filters.status !== 'all' ||
    filters.productivity !== 'all'
  );
}

/** Predicado de coincidencia de una tarea hoja con los filtros (sin capítulo). */
export function matchesLeaf(t: WorkspaceTask, filters: WorkspaceFilters): boolean {
  const q = filters.search.trim().toLowerCase();
  if (q !== '' && !t.wbsCode.toLowerCase().includes(q) && !t.name.toLowerCase().includes(q)) {
    return false;
  }
  if (filters.status !== 'all') {
    if (filters.status === 'delayed') {
      if (!isDelayed(t)) return false;
    } else if (t.status !== filters.status) {
      return false;
    }
  }
  if (filters.productivity !== 'all' && t.productivitySource !== filters.productivity) {
    return false;
  }
  return true;
}

export interface VisibleGroup {
  group: ChapterGroup;
  children: WorkspaceTask[];
}

/**
 * Aplica capítulo + filtros de hoja y devuelve los grupos visibles con sus hijos
 * filtrados. Cuando hay filtros activos, oculta capítulos sin coincidencias.
 */
export function computeVisibleGroups(
  groups: ChapterGroup[],
  chapterFilter: string,
  filters: WorkspaceFilters,
): VisibleGroup[] {
  const active = filtersActive(filters, chapterFilter);
  return groups
    .filter((g) => chapterFilter === 'all' || g.id === chapterFilter)
    .map((g) => ({ group: g, children: g.children.filter((c) => matchesLeaf(c, filters)) }))
    .filter(({ children }) => !active || children.length > 0);
}

/** Cuenta de actividades sin APU (manual) y con APU sin rendimiento (unknown). */
export function warningCounts(tasks: WorkspaceTask[]): { noApu: number; noYield: number } {
  let noApu = 0;
  let noYield = 0;
  for (const t of tasks) {
    if (t.taskType !== 'activity') continue;
    if (t.productivitySource === 'manual') noApu += 1;
    else if (t.productivitySource === 'unknown') noYield += 1;
  }
  return { noApu, noYield };
}
