/**
 * schedule-workspace-filter.test.ts — Lógica pura del workspace de cronograma
 * (SCHEDULE_WORKSPACE_UX_V1, Fase 1). Solo presentación; no toca el motor.
 */
import { describe, it, expect } from 'vitest';
import {
  groupByChapter,
  computeVisibleGroups,
  warningCounts,
  matchesLeaf,
  isDelayed,
  SYNTHETIC_CHAPTER,
  type WorkspaceTask,
  type WorkspaceFilters,
} from '@/app/(dashboard)/planning/[scheduleId]/schedule-workspace-filter';

const NO_FILTER: WorkspaceFilters = { search: '', status: 'all', productivity: 'all' };

function task(over: Partial<WorkspaceTask> & { id: string }): WorkspaceTask {
  return {
    wbsCode: '01.001',
    name: 'Tarea',
    parentTaskId: null,
    taskType: 'activity',
    isMilestone: false,
    plannedStart: '2026-06-22',
    plannedEnd: '2026-06-25',
    plannedDurationDays: '4',
    progressPct: '0',
    status: 'not_started',
    varianceStatus: 'on_track',
    productivitySource: 'apu',
    apuTemplateId: 'apu1',
    boqItemId: 'boq1',
    ...over,
  };
}

const CH1 = task({ id: 'ch1', wbsCode: '01', name: 'Preliminares', taskType: 'chapter', productivitySource: null, apuTemplateId: null, boqItemId: null });
const CH2 = task({ id: 'ch2', wbsCode: '02', name: 'Cimentación', taskType: 'chapter', productivitySource: null, apuTemplateId: null, boqItemId: null });
const A1 = task({ id: 'a1', wbsCode: '01.001', name: 'Excavación', parentTaskId: 'ch1', productivitySource: 'apu' });
const A2 = task({ id: 'a2', wbsCode: '01.002', name: 'Relleno', parentTaskId: 'ch1', productivitySource: 'manual', apuTemplateId: null, status: 'in_progress', progressPct: '40' });
const A3 = task({ id: 'a3', wbsCode: '02.001', name: 'Zapatas', parentTaskId: 'ch2', productivitySource: 'unknown', status: 'completed', progressPct: '100' });
const M1 = task({ id: 'm1', wbsCode: '02.M', name: 'Fin Cimentación', parentTaskId: 'ch2', taskType: 'milestone', isMilestone: true, productivitySource: null, apuTemplateId: null, boqItemId: null });
const ORPHAN = task({ id: 'o1', wbsCode: '99.001', name: 'Suelta', parentTaskId: null, productivitySource: 'manual', apuTemplateId: null });

const ALL = [CH1, A1, A2, CH2, A3, M1];

describe('groupByChapter', () => {
  it('agrupa actividades e hitos bajo su capítulo, en orden', () => {
    const groups = groupByChapter(ALL);
    expect(groups.map((g) => g.id)).toEqual(['ch1', 'ch2']);
    expect(groups[0]!.children.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(groups[1]!.children.map((c) => c.id)).toEqual(['a3', 'm1']);
  });

  it('coloca tareas sin capítulo válido en grupo sintético "Sin capítulo"', () => {
    const groups = groupByChapter([CH1, A1, ORPHAN]);
    const orphan = groups.find((g) => g.id === SYNTHETIC_CHAPTER);
    expect(orphan).toBeDefined();
    expect(orphan!.children.map((c) => c.id)).toEqual(['o1']);
  });
});

describe('matchesLeaf — filtros', () => {
  it('búsqueda por WBS o nombre (case-insensitive)', () => {
    expect(matchesLeaf(A1, { ...NO_FILTER, search: 'excav' })).toBe(true);
    expect(matchesLeaf(A1, { ...NO_FILTER, search: '01.001' })).toBe(true);
    expect(matchesLeaf(A1, { ...NO_FILTER, search: 'relleno' })).toBe(false);
  });

  it('filtro por estado', () => {
    expect(matchesLeaf(A2, { ...NO_FILTER, status: 'in_progress' })).toBe(true);
    expect(matchesLeaf(A1, { ...NO_FILTER, status: 'in_progress' })).toBe(false);
    expect(matchesLeaf(A3, { ...NO_FILTER, status: 'completed' })).toBe(true);
  });

  it('filtro por rendimiento (apu/manual/unknown)', () => {
    expect(matchesLeaf(A1, { ...NO_FILTER, productivity: 'apu' })).toBe(true);
    expect(matchesLeaf(A2, { ...NO_FILTER, productivity: 'manual' })).toBe(true);
    expect(matchesLeaf(A3, { ...NO_FILTER, productivity: 'unknown' })).toBe(true);
    expect(matchesLeaf(A1, { ...NO_FILTER, productivity: 'manual' })).toBe(false);
  });

  it('filtro "atrasadas" usa varianceStatus behind (no hitos)', () => {
    const behind = task({ id: 'b', parentTaskId: 'ch1', varianceStatus: 'behind' });
    const behindMs = task({ id: 'bm', parentTaskId: 'ch1', varianceStatus: 'behind', isMilestone: true, taskType: 'milestone' });
    expect(isDelayed(behind)).toBe(true);
    expect(isDelayed(behindMs)).toBe(false);
    expect(matchesLeaf(behind, { ...NO_FILTER, status: 'delayed' })).toBe(true);
    expect(matchesLeaf(A1, { ...NO_FILTER, status: 'delayed' })).toBe(false);
  });
});

describe('computeVisibleGroups', () => {
  it('sin filtros: muestra todos los grupos con todos sus hijos', () => {
    const vis = computeVisibleGroups(groupByChapter(ALL), 'all', NO_FILTER);
    expect(vis.map((v) => v.group.id)).toEqual(['ch1', 'ch2']);
    expect(vis.reduce((n, v) => n + v.children.length, 0)).toBe(4);
  });

  it('filtro por rendimiento manual oculta capítulos sin coincidencias', () => {
    const vis = computeVisibleGroups(groupByChapter(ALL), 'all', { ...NO_FILTER, productivity: 'manual' });
    expect(vis.map((v) => v.group.id)).toEqual(['ch1']); // solo ch1 tiene una 'manual'
    expect(vis[0]!.children.map((c) => c.id)).toEqual(['a2']);
  });

  it('filtro por capítulo restringe a ese capítulo', () => {
    const vis = computeVisibleGroups(groupByChapter(ALL), 'ch2', NO_FILTER);
    expect(vis.map((v) => v.group.id)).toEqual(['ch2']);
  });

  it('búsqueda sin coincidencias devuelve sin grupos', () => {
    const vis = computeVisibleGroups(groupByChapter(ALL), 'all', { ...NO_FILTER, search: 'zzzz' });
    expect(vis).toHaveLength(0);
  });
});

describe('warningCounts', () => {
  it('cuenta sin APU (manual) y sin rendimiento (unknown) solo en actividades', () => {
    const counts = warningCounts(ALL);
    expect(counts.noApu).toBe(1); // a2
    expect(counts.noYield).toBe(1); // a3
  });
});
