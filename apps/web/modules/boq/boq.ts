/**
 * boq.ts — Cálculo de BOQ: ítem, capítulo y costos directos.
 *
 * Propiedad: agent-cost-domain.
 *
 * Funciones PURAS, precisión decimal completa (Q9), sin redondeo intermedio.
 *
 * Fórmulas (docs/PROJECT_MASTER.md §6.8, docs/API_CONTRACTS.md §BoqItem):
 *   subtotal_item   = quantity_snapshot × unit_price_snapshot
 *   subtotal_cap    = Σ subtotales de los ítems del capítulo
 *   costos_directos = Σ subtotales de capítulos (= Σ de todos los ítems)
 */

import type { DecimalString, Uuid } from '@/lib/utils/types';
import { toDecimal, toDecimalString, sumDecimals } from '../apu/decimal';

/** Ítem BOQ mínimo para cálculo (subconjunto cliente-safe). */
export interface BoqItemInput {
  id?: Uuid;
  chapterId: Uuid;
  quantitySnapshot: DecimalString;
  unitPriceSnapshot: DecimalString;
}

/**
 * Calcula el subtotal de un ítem BOQ.
 *   subtotal = quantity_snapshot × unit_price_snapshot
 * Función PURA. `quantity = 0` ⇒ subtotal "0" (comportamiento definido).
 *
 * @param item - Cantidad y precio unitario snapshot.
 * @returns Subtotal del ítem como `DecimalString`.
 * @throws Error si la cantidad es negativa.
 */
export function calculateBoqItemSubtotal(
  item: Pick<BoqItemInput, 'quantitySnapshot' | 'unitPriceSnapshot'>,
): DecimalString {
  const qty = toDecimal(item.quantitySnapshot);
  if (qty.isNegative()) {
    throw new Error(`quantitySnapshot no puede ser negativa: ${qty.toFixed()}`);
  }
  return toDecimalString(qty.times(toDecimal(item.unitPriceSnapshot)));
}

/**
 * Calcula el subtotal de un capítulo: suma de subtotales de sus ítems.
 * Función PURA. Acepta subtotales ya calculados (recomendado pasar
 * `calculateBoqItemSubtotal` por ítem para una sola fuente de verdad).
 *
 * @param itemSubtotals - Subtotales de los ítems del capítulo.
 * @returns Subtotal del capítulo como `DecimalString` ("0" si no hay ítems).
 */
export function calculateChapterTotal(itemSubtotals: readonly DecimalString[]): DecimalString {
  return sumDecimals(itemSubtotals);
}

/**
 * Calcula los costos directos: suma de subtotales de todos los ítems (o,
 * equivalentemente, de todos los capítulos). Función PURA.
 *
 * @param itemSubtotals - Subtotales de todos los ítems del presupuesto.
 * @returns Costos directos como `DecimalString`.
 */
export function calculateDirectCosts(itemSubtotals: readonly DecimalString[]): DecimalString {
  return sumDecimals(itemSubtotals);
}

/** Subtotal de un capítulo identificado. */
export interface ChapterSubtotal {
  chapterId: Uuid;
  subtotal: DecimalString;
}

/**
 * Agrupa ítems por capítulo y calcula el subtotal de cada uno y los costos
 * directos totales en una sola pasada. Función PURA.
 *
 * @param items - Ítems BOQ (con `chapterId`, cantidad y precio snapshot).
 * @returns Subtotales por capítulo (en orden de aparición) y costos directos.
 */
export function calculateBoq(items: readonly BoqItemInput[]): {
  itemSubtotals: DecimalString[];
  chapterSubtotals: ChapterSubtotal[];
  directCosts: DecimalString;
} {
  const itemSubtotals: DecimalString[] = [];
  const byChapter = new Map<Uuid, DecimalString[]>();
  const order: Uuid[] = [];

  for (const item of items) {
    const subtotal = calculateBoqItemSubtotal(item);
    itemSubtotals.push(subtotal);
    let bucket = byChapter.get(item.chapterId);
    if (bucket === undefined) {
      bucket = [];
      byChapter.set(item.chapterId, bucket);
      order.push(item.chapterId);
    }
    bucket.push(subtotal);
  }

  const chapterSubtotals: ChapterSubtotal[] = order.map((chapterId) => ({
    chapterId,
    subtotal: calculateChapterTotal(byChapter.get(chapterId) ?? []),
  }));

  return {
    itemSubtotals,
    chapterSubtotals,
    directCosts: calculateDirectCosts(itemSubtotals),
  };
}
