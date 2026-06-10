/**
 * commercial-simulation.ts — Dominio PURO del Simulador Comercial V1
 * (Oleada OPERATIONAL BUDGET UX V1).
 *
 * Propiedad: agent-cost-domain (integrado por el orquestador).
 * Contrato: `docs/OPERATIONAL_BUDGET_UX_V1_CONTRACT.md §5`.
 *
 * Reglas NO negociables:
 *  - PURO: sin DB, sin red, sin efectos secundarios. Todo con `Decimal`.
 *  - La simulación NUNCA modifica BOQ, AIU, exports ni versiones emitidas.
 *  - El `baseTotal` (total técnico) se deriva SIEMPRE server-side
 *    (`calculateEstimateFinancialSummary`); jamás se confía al navegador.
 *  - Porcentajes en formato HUMANO (`"3.5"` = 3.5 %), como en AIU.
 *
 * Fórmula (contrato §5):
 *   subtotal_comercial      = base × (1 + ajuste_comercial/100)
 *   descuento               = subtotal_comercial × descuento_pct/100
 *   subtotal_con_descuento  = subtotal_comercial − descuento
 *   impuesto                = subtotal_con_descuento × impuesto_pct/100
 *   precio_final            = subtotal_con_descuento + impuesto
 *   diferencia_objetivo     = precio_final − precio_objetivo (si hay objetivo)
 */
import Decimal from 'decimal.js';
import type { DecimalString } from '@/lib/utils/types';

/** Límites humanos por campo (documentados en el contrato §5). */
export const COMMERCIAL_ADJUSTMENT_MIN = -100;
export const COMMERCIAL_ADJUSTMENT_MAX = 100;
export const COMMERCIAL_PCT_MAX = 100;

/** Estado del precio final frente al precio objetivo. */
export type TargetStatus = 'on_target' | 'above_target' | 'below_target';

/** Entrada permitida (porcentajes humanos; el base llega server-side). */
export interface CommercialSimulationInput {
  /** Total técnico base (grandTotal server-derived). */
  baseTotal: DecimalString;
  /** Ajuste comercial % (−100..100). Vacío ⇒ 0. */
  commercialAdjustmentPct: DecimalString;
  /** Descuento % (0..100). Vacío ⇒ 0. */
  discountPct: DecimalString;
  /** Impuesto adicional % (0..100). Vacío ⇒ 0. */
  additionalTaxPct: DecimalString;
  /** Precio objetivo opcional (≥ 0). Vacío/null ⇒ sin objetivo. */
  targetPrice?: DecimalString | null;
}

/** Resultado completo de la simulación (montos como DecimalString). */
export interface CommercialSimulationResult {
  baseTotal: DecimalString;
  commercialAdjustmentPct: DecimalString;
  discountPct: DecimalString;
  additionalTaxPct: DecimalString;
  commercialSubtotal: DecimalString;
  discountAmount: DecimalString;
  subtotalAfterDiscount: DecimalString;
  additionalTaxAmount: DecimalString;
  finalPrice: DecimalString;
  targetPrice: DecimalString | null;
  /** precio_final − precio_objetivo (null sin objetivo). */
  targetDifference: DecimalString | null;
  /** Comparación exacta: 0 ⇒ on_target; >0 ⇒ above; <0 ⇒ below. */
  targetStatus: TargetStatus | null;
}

export interface CommercialSimulationIssue {
  field:
    | 'baseTotal'
    | 'commercialAdjustmentPct'
    | 'discountPct'
    | 'additionalTaxPct'
    | 'targetPrice';
  message: string;
}

export class CommercialSimulationValidationError extends Error {
  readonly issues: CommercialSimulationIssue[];
  constructor(issues: CommercialSimulationIssue[]) {
    super('commercial_simulation_invalid');
    this.name = 'CommercialSimulationValidationError';
    this.issues = issues;
  }
}

/**
 * Normaliza un porcentaje humano. Acepta coma decimal, espacios y sufijo `%`.
 * `allowNegative` habilita signo para el ajuste comercial. Vacío ⇒ `"0"`.
 * Devuelve `null` si no es un número válido.
 */
function parsePct(raw: unknown, allowNegative: boolean): string | null {
  if (raw === null || raw === undefined) return '0';
  const s = String(raw).trim().replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
  if (s === '') return '0';
  const pattern = allowNegative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/;
  if (!pattern.test(s)) return null;
  return s;
}

/** Normaliza un monto (≥ 0). Vacío ⇒ `null` (sin valor). */
function parseAmount(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().replace(/\s/g, '').replace(/\$/g, '').replace(/,/g, '.');
  if (s === '') return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined; // inválido
  return s;
}

/**
 * Valida la entrada y calcula la simulación comercial. PURA (Decimal, sin float).
 * @throws CommercialSimulationValidationError con la lista de problemas.
 */
export function simulateCommercialPrice(
  input: CommercialSimulationInput,
): CommercialSimulationResult {
  const issues: CommercialSimulationIssue[] = [];

  // --- Base técnico (server-derived; se valida defensivamente) ---
  let base: Decimal | null = null;
  try {
    base = new Decimal(String(input.baseTotal ?? '').trim() || 'NaN');
    if (base.isNaN()) throw new Error('nan');
    if (base.isNegative()) {
      issues.push({ field: 'baseTotal', message: 'El total técnico base no puede ser negativo.' });
      base = null;
    }
  } catch {
    issues.push({ field: 'baseTotal', message: 'Total técnico base inválido.' });
    base = null;
  }

  // --- Porcentajes ---
  const adjRaw = parsePct(input.commercialAdjustmentPct, true);
  if (adjRaw === null) {
    issues.push({ field: 'commercialAdjustmentPct', message: 'Ajuste comercial: porcentaje inválido.' });
  } else {
    const d = new Decimal(adjRaw);
    if (d.lessThan(COMMERCIAL_ADJUSTMENT_MIN) || d.greaterThan(COMMERCIAL_ADJUSTMENT_MAX)) {
      issues.push({
        field: 'commercialAdjustmentPct',
        message: `Ajuste comercial: debe estar entre ${COMMERCIAL_ADJUSTMENT_MIN}% y ${COMMERCIAL_ADJUSTMENT_MAX}%.`,
      });
    }
  }

  const discRaw = parsePct(input.discountPct, false);
  if (discRaw === null) {
    issues.push({ field: 'discountPct', message: 'Descuento: porcentaje inválido.' });
  } else if (new Decimal(discRaw).greaterThan(COMMERCIAL_PCT_MAX)) {
    issues.push({ field: 'discountPct', message: `Descuento: no puede superar ${COMMERCIAL_PCT_MAX}%.` });
  }

  const taxRaw = parsePct(input.additionalTaxPct, false);
  if (taxRaw === null) {
    issues.push({ field: 'additionalTaxPct', message: 'Impuesto adicional: porcentaje inválido.' });
  } else if (new Decimal(taxRaw).greaterThan(COMMERCIAL_PCT_MAX)) {
    issues.push({ field: 'additionalTaxPct', message: `Impuesto adicional: no puede superar ${COMMERCIAL_PCT_MAX}%.` });
  }

  // --- Precio objetivo opcional ---
  const targetRaw = parseAmount(input.targetPrice);
  if (targetRaw === undefined) {
    issues.push({ field: 'targetPrice', message: 'Precio objetivo inválido (debe ser un monto ≥ 0).' });
  }

  if (issues.length > 0 || base === null || adjRaw === null || discRaw === null || taxRaw === null) {
    throw new CommercialSimulationValidationError(
      issues.length > 0
        ? issues
        : [{ field: 'baseTotal', message: 'Entrada de simulación inválida.' }],
    );
  }

  // --- Cálculo (todo Decimal) ---
  const one = new Decimal(1);
  const hundred = new Decimal(100);
  const adjFraction = new Decimal(adjRaw).div(hundred);
  const discFraction = new Decimal(discRaw).div(hundred);
  const taxFraction = new Decimal(taxRaw).div(hundred);

  const commercialSubtotal = base.times(one.plus(adjFraction));
  const discountAmount = commercialSubtotal.times(discFraction);
  const subtotalAfterDiscount = commercialSubtotal.minus(discountAmount);
  const additionalTaxAmount = subtotalAfterDiscount.times(taxFraction);
  const finalPrice = subtotalAfterDiscount.plus(additionalTaxAmount);

  let targetPrice: DecimalString | null = null;
  let targetDifference: DecimalString | null = null;
  let targetStatus: TargetStatus | null = null;
  if (targetRaw !== null && targetRaw !== undefined) {
    const target = new Decimal(targetRaw);
    const diff = finalPrice.minus(target);
    targetPrice = target.toFixed();
    targetDifference = diff.toFixed();
    targetStatus = diff.isZero() ? 'on_target' : diff.isPositive() ? 'above_target' : 'below_target';
  }

  return {
    baseTotal: base.toFixed(),
    commercialAdjustmentPct: new Decimal(adjRaw).toFixed(),
    discountPct: new Decimal(discRaw).toFixed(),
    additionalTaxPct: new Decimal(taxRaw).toFixed(),
    commercialSubtotal: commercialSubtotal.toFixed(),
    discountAmount: discountAmount.toFixed(),
    subtotalAfterDiscount: subtotalAfterDiscount.toFixed(),
    additionalTaxAmount: additionalTaxAmount.toFixed(),
    finalPrice: finalPrice.toFixed(),
    targetPrice,
    targetDifference,
    targetStatus,
  };
}

/** Disclaimer obligatorio (contrato §5; debe mostrarse en la UI del simulador). */
export const COMMERCIAL_SIMULATION_DISCLAIMER =
  'Esta simulación comercial no modifica el presupuesto técnico ni sus exportaciones.';
