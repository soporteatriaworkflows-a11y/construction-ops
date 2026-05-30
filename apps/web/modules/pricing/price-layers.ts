/**
 * Capas de precio — cálculo canónico (Q8) — agent-pricing (Oleada 2A).
 *
 * Fuente ÚNICA de verdad de la derivación comercial. cost-domain NO recalcula
 * estas fórmulas; consume `ApprovedPriceContext` ya resuelto.
 *
 * Fórmulas canónicas (Q8 — base = onlinePublicPrice):
 *   budgetReferencePrice  = onlinePublicPrice × (1 + preventiveVariationPct)
 *   expectedPurchasePrice = onlinePublicPrice × (1 − negotiatedDiscountPct)
 *   projectedSaving       = budgetReferencePrice − expectedPurchasePrice
 *   realizedSaving        = budgetReferencePrice − actualPurchasePrice  (si existe)
 *
 * Todas las operaciones con Decimal.js, sin redondeo intermedio (Q9). Dinero y
 * porcentajes como `DecimalString` (porcentajes en forma decimal: 3 % → "0.03").
 */
import type { DecimalString } from "@/lib/utils/types";

import { toDecimal, toDecimalString } from "./decimal";

/** Entradas crudas de la capa de precio (todas internas, 🔒). */
export interface PriceLayerInputs {
  /** precio público observado (base del cálculo, Q8) */
  onlinePublicPrice: DecimalString;
  /** variación preventiva como fracción (ej. "0.03") */
  preventiveVariationPct: DecimalString;
  /** descuento negociado como fracción (ej. "0.10") */
  negotiatedDiscountPct: DecimalString;
  /** precio real de compra (factura), opcional */
  actualPurchasePrice?: DecimalString | null;
}

/** Resultado de la derivación de capas (todos los campos derivados). */
export interface PriceLayerResult {
  budgetReferencePrice: DecimalString;
  expectedPurchasePrice: DecimalString;
  projectedSaving: DecimalString;
  realizedSaving?: DecimalString;
}

/**
 * Deriva las capas de precio a partir de las entradas crudas, aplicando las
 * fórmulas canónicas Q8 con Decimal.js (sin redondeo intermedio).
 */
export function derivePriceLayers(inputs: PriceLayerInputs): PriceLayerResult {
  const onlinePublic = toDecimal(inputs.onlinePublicPrice);
  const preventive = toDecimal(inputs.preventiveVariationPct);
  const discount = toDecimal(inputs.negotiatedDiscountPct);

  // budgetReferencePrice = onlinePublicPrice × (1 + preventiveVariationPct)
  const budgetReference = onlinePublic.times(preventive.plus(1));

  // expectedPurchasePrice = onlinePublicPrice × (1 − negotiatedDiscountPct)
  const expectedPurchase = onlinePublic.times(toDecimal(1).minus(discount));

  // projectedSaving = budgetReferencePrice − expectedPurchasePrice
  const projectedSaving = budgetReference.minus(expectedPurchase);

  const result: PriceLayerResult = {
    budgetReferencePrice: toDecimalString(budgetReference),
    expectedPurchasePrice: toDecimalString(expectedPurchase),
    projectedSaving: toDecimalString(projectedSaving),
  };

  // realizedSaving = budgetReferencePrice − actualPurchasePrice (solo si existe)
  if (
    inputs.actualPurchasePrice !== undefined &&
    inputs.actualPurchasePrice !== null
  ) {
    const actual = toDecimal(inputs.actualPurchasePrice);
    result.realizedSaving = toDecimalString(budgetReference.minus(actual));
  }

  return result;
}
