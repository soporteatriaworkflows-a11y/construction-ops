/**
 * dxf-entity-filter.ts — Filtro manual de lectura por capa/color (F8B, puro).
 *
 * La usuaria decide qué mirar: todas las entidades, solo capas estructurales,
 * capas seleccionadas y/o colores seleccionados, con o sin rótulo. El filtro
 * SOLO cambia la lista visible — jamás destruye ni descarta datos del parse:
 * capa y color son señales, no verdad absoluta.
 */
import type { DxfEntity } from './dxf-entities';
import { isStructuralLayer, isTitleLayer } from './dxf-structural-extractor';

export type DxfFilterMode = 'all' | 'structural_layers' | 'custom';

export interface DxfEntityFilter {
  mode: DxfFilterMode;
  /** Capas visibles cuando mode = custom (vacío ⇒ ninguna restricción). */
  layers?: readonly string[];
  /** Colores ACI visibles cuando mode = custom (vacío ⇒ sin restricción). */
  colorIndexes?: readonly number[];
  /** Incluir capas de rótulo/carátula (default: true en "all"). */
  includeTitleBlock?: boolean;
}

export const DXF_FILTER_MODE_LABEL: Record<DxfFilterMode, string> = {
  all: 'Todas las entidades',
  structural_layers: 'Solo capas estructurales',
  custom: 'Capas/colores seleccionados',
};

/** Lo mínimo que el filtro necesita saber de una entidad/candidato. */
export interface DxfFilterable {
  layer: string;
  colorIndex?: number;
}

/** ¿La entidad/candidato pasa el filtro? Pura, sin efectos. */
export function matchesDxfFilter(entity: DxfFilterable, filter: DxfEntityFilter): boolean {
  const includeTitleBlock = filter.includeTitleBlock ?? filter.mode === 'all';
  if (!includeTitleBlock && isTitleLayer(entity.layer)) return false;

  if (filter.mode === 'all') return true;
  if (filter.mode === 'structural_layers') return isStructuralLayer(entity.layer);

  const layerOk = !filter.layers || filter.layers.length === 0 || filter.layers.includes(entity.layer);
  const colorOk =
    !filter.colorIndexes ||
    filter.colorIndexes.length === 0 ||
    (entity.colorIndex !== undefined && filter.colorIndexes.includes(entity.colorIndex));
  return layerOk && colorOk;
}

/**
 * Filtra la lista VISIBLE de entidades. El array de entrada queda intacto:
 * quien filtra puede volver a "todas" sin perder nada.
 */
export function filterDxfEntities(
  entities: readonly DxfEntity[],
  filter: DxfEntityFilter,
): readonly DxfEntity[] {
  if (filter.mode === 'all' && (filter.includeTitleBlock ?? true)) return entities;
  return entities.filter((entity) => matchesDxfFilter(entity, filter));
}
