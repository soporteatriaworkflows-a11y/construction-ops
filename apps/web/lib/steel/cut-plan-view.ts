/**
 * cut-plan-view.ts — Filtros e índice del plan de corte (F8C-A, puro).
 *
 * El plan de corte, el banco de sobrantes y los grupos por varilla crecen
 * rápido y la revisión se vuelve scroll infinito. Estos helpers PUROS
 * calculan la vista comprimida: filtrar por varilla/longitud/estado/texto,
 * y armar el índice compacto (#3 · #4 · #5 · rechazados · sobrantes).
 * Solo cambian lo VISIBLE — jamás mutan el plan ni el pedido.
 */
import type { SteelCutPlan, SteelOffcut } from '@/modules/steel';

/** Grupo de barras por spec, como lo entrega `groupBarsBySpec`. */
export interface CutPlanGroupLike {
  specId: string;
  specLabel: string;
  bars: readonly SteelCutPlan['bars'][number][];
}

export type CutPlanViewMode = 'todo' | 'solo_rechazados' | 'solo_sobrantes';

export const CUT_PLAN_VIEW_MODE_LABEL: Record<CutPlanViewMode, string> = {
  todo: 'Todo el plan',
  solo_rechazados: 'Solo rechazados',
  solo_sobrantes: 'Solo sobrantes',
};

export interface CutPlanFilterState {
  mode: CutPlanViewMode;
  /** Specs visibles (vacío = todas). */
  specIds: readonly string[];
  /** Longitud comercial exacta ("12") o '' = todas. */
  commercialLengthM: string;
  /** Búsqueda por barra, corte o descripción de línea. */
  search: string;
}

export const EMPTY_CUT_PLAN_FILTER: CutPlanFilterState = {
  mode: 'todo',
  specIds: [],
  commercialLengthM: '',
  search: '',
};

const COMBINING_MARKS = /[̀-ͯ]/g;

function normalize(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

function barMatchesSearch(
  bar: SteelCutPlan['bars'][number],
  needle: string,
  descriptionsByLineId: ReadonlyMap<string, string>,
): boolean {
  if (normalize(bar.id).includes(needle)) return true;
  for (const assignment of bar.assignments) {
    if (normalize(assignment.cutId).includes(needle)) return true;
    const lineId = assignment.cutId.split('#')[0] ?? assignment.cutId;
    const description = descriptionsByLineId.get(lineId);
    if (description && normalize(description).includes(needle)) return true;
  }
  return false;
}

/**
 * Filtra los grupos del plan por spec, longitud comercial y búsqueda.
 * Devuelve grupos NUEVOS con solo las barras visibles (los datos originales
 * quedan intactos); grupos sin barras visibles desaparecen de la vista.
 */
export function filterCutPlanGroups(
  groups: readonly CutPlanGroupLike[],
  filter: CutPlanFilterState,
  descriptionsByLineId: ReadonlyMap<string, string> = new Map(),
): readonly CutPlanGroupLike[] {
  if (filter.mode !== 'todo') return [];
  const needle = normalize(filter.search.trim());
  return groups
    .filter((group) => filter.specIds.length === 0 || filter.specIds.includes(group.specId))
    .map((group) => ({
      ...group,
      bars: group.bars.filter((bar) => {
        if (filter.commercialLengthM && String(bar.commercialLengthM) !== filter.commercialLengthM) return false;
        if (needle && !barMatchesSearch(bar, needle, descriptionsByLineId)) return false;
        return true;
      }),
    }))
    .filter((group) => group.bars.length > 0);
}

/** Filtra el banco de sobrantes por spec y búsqueda. */
export function filterOffcuts(
  offcuts: readonly SteelOffcut[],
  filter: Pick<CutPlanFilterState, 'mode' | 'specIds' | 'search'>,
): readonly SteelOffcut[] {
  if (filter.mode === 'solo_rechazados') return [];
  const needle = normalize(filter.search.trim());
  return offcuts.filter((offcut) => {
    if (filter.specIds.length > 0 && !filter.specIds.includes(offcut.steelSpecId)) return false;
    if (needle && !normalize(`${offcut.id} ${offcut.steelSpecId} ${offcut.status}`).includes(needle)) return false;
    return true;
  });
}

export interface CutPlanIndexEntry {
  /** Id de ancla en la página ("plan-group-spec-rebar-3"). */
  anchorId: string;
  label: string;
  count: number;
}

/** Índice compacto de navegación: un chip por varilla + rechazados + sobrantes. */
export function buildCutPlanIndex(
  groups: readonly CutPlanGroupLike[],
  rejectedCount: number,
  offcutCount: number,
): readonly CutPlanIndexEntry[] {
  const entries: CutPlanIndexEntry[] = groups.map((group) => ({
    anchorId: `plan-group-${group.specId}`,
    label: group.specLabel.replace(/^Varilla corrugada\s+/i, ''),
    count: group.bars.length,
  }));
  if (rejectedCount > 0) entries.push({ anchorId: 'plan-rechazados', label: 'Rechazados', count: rejectedCount });
  if (offcutCount > 0) entries.push({ anchorId: 'plan-sobrantes', label: 'Sobrantes', count: offcutCount });
  return entries;
}

/** Longitudes comerciales presentes en el plan (para el filtro). */
export function commercialLengthsInPlan(groups: readonly CutPlanGroupLike[]): readonly string[] {
  const lengths = new Set<string>();
  for (const group of groups) {
    for (const bar of group.bars) lengths.add(String(bar.commercialLengthM));
  }
  return [...lengths].sort((a, b) => Number(a) - Number(b));
}
