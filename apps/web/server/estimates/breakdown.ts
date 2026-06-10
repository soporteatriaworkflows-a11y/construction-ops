/**
 * breakdown.ts — Desglose por capítulos del presupuesto (PURO, server-side).
 * Oleada OPERATIONAL BUDGET UX V1.
 *
 * Propiedad: agent-db-rls (integrado por el orquestador).
 * Contrato: `docs/OPERATIONAL_BUDGET_UX_V1_CONTRACT.md §4`.
 *
 * Calcula la participación (`share`, fracción 0..1) de cada capítulo ACTIVO
 * sobre el costo directo, con `Decimal` (sin float). La UI solo formatea;
 * NUNCA recalcula porcentajes en React.
 *
 * NOTA (deuda registrada COST_TYPE_BREAKDOWN_FOUNDATION): `boq_items` no
 * clasifica tipo de costo (materiales/mano de obra/equipos/subcontratos);
 * `apu_template_id` es nullable y los ítems importados/manuales no lo traen.
 * Por eso el desglose confiable es POR CAPÍTULO; no se inventa un breakdown
 * por tipo de costo.
 */
import Decimal from 'decimal.js';
import type { DecimalString } from '@/lib/utils/types';
import type { ChapterReviewItem } from '@/lib/estimates/review-types';

/** Fila del desglose por capítulo (montos/fracciones server-derived). */
export interface ChapterBreakdownRow {
  chapterId: string;
  code: string;
  name: string;
  subtotal: DecimalString;
  /** Fracción 0..1 del costo directo activo (DecimalString). */
  share: DecimalString;
  itemCount: number;
}

/**
 * Desglose por capítulos ACTIVOS (los archivados no participan del costo).
 * Si el costo directo es 0, todas las participaciones son "0" (sin división).
 */
export function computeChapterBreakdown(
  chapters: ChapterReviewItem[],
): { rows: ChapterBreakdownRow[]; directTotal: DecimalString } {
  const active = chapters.filter((ch) => !ch.archived);
  const directTotal = active.reduce(
    (acc, ch) => acc.plus(new Decimal(ch.subtotal)),
    new Decimal(0),
  );
  const zero = directTotal.isZero();
  const rows = active
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((ch) => ({
      chapterId: ch.id,
      code: ch.code,
      name: ch.name,
      subtotal: ch.subtotal,
      share: zero ? '0' : new Decimal(ch.subtotal).div(directTotal).toFixed(6),
      itemCount: ch.itemCount,
    }));
  return { rows, directTotal: directTotal.toFixed() };
}
