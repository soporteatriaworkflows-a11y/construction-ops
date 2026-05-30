/**
 * Flujo de aprobación de variaciones — agent-pricing (Oleada 2A).
 *
 * Una nueva observación cuya variación frente al último precio aprobado supere
 * el umbral configurable REQUIERE aprobación humana explícita. NUNCA se aprueba
 * automáticamente una variación fuera de umbral (acción prohibida).
 *
 * La variación se mide en valor absoluto sobre el precio base previo:
 *   variationPct = |observedPrice − previousApprovedPrice| / previousApprovedPrice
 *
 * Cálculo con Decimal.js (sin float JS). El umbral es una fracción
 * (`DecimalString`, ej. "0.10" = 10 %) y se inyecta; no se hardcodea.
 */
import type { DecimalString } from "@/lib/utils/types";

import { toDecimal, toDecimalString } from "./decimal";

export interface VariationAssessment {
  /** variación absoluta como fracción (DecimalString). null si no hay base. */
  variationPct: DecimalString | null;
  /** true si la variación supera el umbral ⇒ requiere aprobación humana. */
  requiresApproval: boolean;
  /** umbral aplicado (fracción). */
  thresholdPct: DecimalString;
}

/**
 * Evalúa si una nueva observación requiere aprobación humana por variación.
 *
 * - Si no hay precio aprobado previo (`previousApprovedPrice` null/undefined),
 *   se considera que requiere aprobación (primera carga = decisión humana),
 *   y `variationPct` queda en `null`.
 * - Si el precio previo es 0, cualquier precio nuevo distinto de 0 se trata
 *   como variación que requiere aprobación (no se divide por cero).
 */
export function assessVariation(
  observedPrice: DecimalString,
  previousApprovedPrice: DecimalString | null | undefined,
  thresholdPct: DecimalString,
): VariationAssessment {
  const threshold = toDecimal(thresholdPct);

  if (previousApprovedPrice === null || previousApprovedPrice === undefined) {
    return {
      variationPct: null,
      requiresApproval: true,
      thresholdPct,
    };
  }

  const prev = toDecimal(previousApprovedPrice);
  const next = toDecimal(observedPrice);

  if (prev.isZero()) {
    const requires = !next.isZero();
    return {
      variationPct: null,
      requiresApproval: requires,
      thresholdPct,
    };
  }

  const variation = next.minus(prev).abs().div(prev);
  return {
    variationPct: toDecimalString(variation),
    // Estrictamente mayor que el umbral ⇒ requiere aprobación.
    requiresApproval: variation.greaterThan(threshold),
    thresholdPct,
  };
}
