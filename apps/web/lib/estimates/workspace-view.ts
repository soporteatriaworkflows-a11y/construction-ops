/**
 * workspace-view.ts — Helpers PUROS de la vista del BOQ Workspace
 * (Oleada OPERATIONAL BUDGET UX V1). CLIENT-SAFE.
 *
 * Propiedad: agent-frontend-boq (integrado por el orquestador).
 * Contrato: `docs/OPERATIONAL_BUDGET_UX_V1_CONTRACT.md §3`.
 *
 * REGLA: aquí NO hay matemática financiera. Solo filtrado, búsqueda y
 * visibilidad sobre datos ya derivados server-side (subtotales, totales y
 * participaciones llegan calculados del servidor).
 */
import type { BoqItemReviewView, ChapterReviewItem } from '@/lib/estimates/review-types';

/** Filtro de estado del workspace. */
export type WorkspaceFilter = 'active' | 'archived' | 'all';

export const WORKSPACE_FILTER_LABELS: Record<WorkspaceFilter, string> = {
  active: 'Activos',
  archived: 'Archivados',
  all: 'Todos',
};

/** Capítulo + ítems, tal como llegan del servidor (incluye archivados). */
export interface WorkspaceChapterData {
  chapter: ChapterReviewItem;
  items: BoqItemReviewView[];
}

/** Resultado de aplicar filtro + búsqueda (solo visibilidad; sin recálculo). */
export interface VisibleWorkspaceChapter {
  chapter: ChapterReviewItem;
  items: BoqItemReviewView[];
  /** Ítems visibles tras filtro/búsqueda (los subtotales NO se recalculan). */
  matchedByChapter: boolean;
}

/** Normaliza texto para búsqueda: minúsculas y sin tildes. */
export function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function itemMatchesFilter(item: BoqItemReviewView, chapterArchived: boolean, filter: WorkspaceFilter): boolean {
  const archived = item.archived || chapterArchived;
  if (filter === 'active') return !archived;
  if (filter === 'archived') return archived;
  return true;
}

function chapterMatchesFilter(chapter: ChapterReviewItem, filter: WorkspaceFilter): boolean {
  if (filter === 'active') return !chapter.archived;
  if (filter === 'all') return true;
  // 'archived': el capítulo aparece si él mismo está archivado o si conserva
  // ítems archivados (se resuelve con los ítems en applyWorkspaceView).
  return true;
}

function itemMatchesQuery(item: BoqItemReviewView, q: string): boolean {
  if (!q) return true;
  return (
    normalizeSearch(item.code).includes(q) ||
    normalizeSearch(item.description).includes(q)
  );
}

function chapterMatchesQuery(chapter: ChapterReviewItem, q: string): boolean {
  if (!q) return true;
  return (
    normalizeSearch(chapter.code).includes(q) ||
    normalizeSearch(chapter.name).includes(q)
  );
}

/**
 * Aplica filtro de estado + búsqueda por código/descripción.
 *
 * - Búsqueda: un capítulo es visible si él mismo coincide (muestra todos sus
 *   ítems filtrados) o si alguno de sus ítems coincide (muestra solo esos).
 * - Filtro `archived`: solo nodos archivados (capítulo archivado o ítems
 *   archivados individualmente).
 * - Los subtotales mostrados siguen siendo los del SERVIDOR (no se recalculan
 *   al filtrar; la UI lo comunica como "vista filtrada").
 */
export function applyWorkspaceView(
  data: WorkspaceChapterData[],
  filter: WorkspaceFilter,
  query: string,
): VisibleWorkspaceChapter[] {
  const q = normalizeSearch(query);
  const out: VisibleWorkspaceChapter[] = [];
  for (const entry of data) {
    const { chapter } = entry;
    if (!chapterMatchesFilter(chapter, filter)) continue;

    const filteredItems = entry.items.filter((it) =>
      itemMatchesFilter(it, chapter.archived, filter),
    );

    const chapterHit = chapterMatchesQuery(chapter, q);
    const visibleItems = chapterHit
      ? filteredItems
      : filteredItems.filter((it) => itemMatchesQuery(it, q));

    // En filtro 'archived', un capítulo activo sin ítems archivados no aparece.
    if (filter === 'archived' && !chapter.archived && filteredItems.length === 0) continue;
    // Con búsqueda activa: ocultar capítulos sin coincidencia propia ni de ítems.
    if (q && !chapterHit && visibleItems.length === 0) continue;

    out.push({ chapter, items: visibleItems, matchedByChapter: chapterHit });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * QUOTING_COMPANION_WORKSPACE_FOCUS_V1 — filtro/estado de vínculo APU por ítem.
 * Read-only; sin cálculo. Honesto: si el origen no expone el vínculo, "unknown".
 * ------------------------------------------------------------------------ */

export type ApuLinkFilter = 'all' | 'with' | 'without';

export const APU_FILTER_LABELS: Record<ApuLinkFilter, string> = {
  all: 'Todos',
  with: 'Con APU',
  without: 'Sin APU',
};

export type ApuItemState = 'linked' | 'unlinked' | 'unknown';

export const APU_STATE_LABELS: Record<ApuItemState, string> = {
  linked: 'APU vinculado',
  unlinked: 'Sin APU',
  unknown: 'No verificable',
};

/** Estado de vínculo APU de un ítem. `undefined` ⇒ no verificable (no inventa). */
export function itemApuState(item: BoqItemReviewView): ApuItemState {
  if (item.apuTemplateId === undefined) return 'unknown';
  return item.apuTemplateId ? 'linked' : 'unlinked';
}

/**
 * Filtra la vista por estado de vínculo APU. `with` ⇒ solo vinculados; `without`
 * ⇒ solo sin vínculo. Los `unknown` NO aparecen en with/without (no se puede
 * confirmar). Oculta capítulos que quedan sin ítems visibles.
 */
export function applyApuFilter(
  view: VisibleWorkspaceChapter[],
  filter: ApuLinkFilter,
): VisibleWorkspaceChapter[] {
  if (filter === 'all') return view;
  const target: ApuItemState = filter === 'with' ? 'linked' : 'unlinked';
  const out: VisibleWorkspaceChapter[] = [];
  for (const ch of view) {
    const items = ch.items.filter((it) => itemApuState(it) === target);
    if (items.length > 0) out.push({ ...ch, items });
  }
  return out;
}

/** ¿Hay al menos un ítem cuyo vínculo APU se puede verificar en esta vista? */
export function hasVerifiableApu(view: VisibleWorkspaceChapter[]): boolean {
  return view.some((ch) => ch.items.some((it) => it.apuTemplateId !== undefined));
}

/** ¿La versión permite mutaciones? (issued/approved/archived ⇒ inmutable). */
export function isVersionEditable(status: string): boolean {
  return !['approved', 'issued', 'archived'].includes(status);
}

/** Conteo de ítems visibles (para el encabezado de resultados). */
export function countVisibleItems(view: VisibleWorkspaceChapter[]): number {
  return view.reduce((acc, ch) => acc + ch.items.length, 0);
}
