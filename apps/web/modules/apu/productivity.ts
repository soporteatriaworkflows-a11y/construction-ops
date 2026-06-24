/**
 * productivity.ts — Conversión y validación PURAS de rendimiento/cuadrilla de
 * mano de obra (APU_PRODUCTIVITY_CREW_OVERRIDES_V1B). Propiedad: agent-cost-domain.
 *
 * Funciones PURAS (Decimal.js, política Q9). NO tocan DB, NO mutan, NO recalculan
 * APUs existentes. Son la fuente de verdad de la conversión entre las dos formas
 * equivalentes del consumo laboral de un componente labor:
 *
 *   - consumo laboral:  labor_quantity = persona·día / unidad   (= apu_components.quantity)
 *   - rendimiento:       productivity   = unidades / día de cuadrilla
 *
 * Con `crew_size` personas (contrato del gate V1B):
 *   labor_quantity = crew_size / productivity
 *   productivity   = crew_size / labor_quantity
 *
 * El motor de costo NO cambia: `quantity` sigue siendo la verdad; estas funciones
 * solo derivan/validan lo que la RPC persistirá (en una fase posterior).
 */
import type { DecimalString } from '@/lib/utils/types';
import { DomainDecimal, toDecimal, toDecimalString } from './decimal';

/** Unidad del valor de rendimiento persistido. */
export type ProductivityUnit = 'person_day_per_unit' | 'unit_per_crew_day';

/** Conjunto de unidades permitidas (espejo del CHECK de la migración). */
export const PRODUCTIVITY_UNITS: readonly ProductivityUnit[] = [
  'person_day_per_unit',
  'unit_per_crew_day',
] as const;

function isPositive(value: DecimalString): boolean {
  try {
    return toDecimal(value).greaterThan(0);
  } catch {
    return false;
  }
}

/**
 * Deriva el consumo laboral (persona·día/unidad) a partir del rendimiento de
 * cuadrilla: `labor_quantity = crew_size / productivity`. PURA.
 *
 * @throws Error si `crewSize <= 0` o `productivity <= 0` (división inválida).
 */
export function deriveLaborQuantityFromProductivity(
  crewSize: DecimalString,
  productivity: DecimalString,
): DecimalString {
  const crew = toDecimal(crewSize);
  const prod = toDecimal(productivity);
  if (!crew.greaterThan(0)) throw new Error('crewSize debe ser > 0');
  if (!prod.greaterThan(0)) throw new Error('productivity debe ser > 0');
  return toDecimalString(crew.dividedBy(prod));
}

/**
 * Deriva el rendimiento de cuadrilla a partir del consumo laboral:
 * `productivity = crew_size / labor_quantity`. PURA.
 *
 * @throws Error si `crewSize <= 0` o `laborQuantity <= 0`.
 */
export function deriveProductivityFromLaborQuantity(
  crewSize: DecimalString,
  laborQuantity: DecimalString,
): DecimalString {
  const crew = toDecimal(crewSize);
  const qty = toDecimal(laborQuantity);
  if (!crew.greaterThan(0)) throw new Error('crewSize debe ser > 0');
  if (!qty.greaterThan(0)) throw new Error('laborQuantity debe ser > 0');
  return toDecimalString(crew.dividedBy(qty));
}

/** Entrada de un override de rendimiento (espejo de los parámetros de la RPC). */
export interface ProductivityOverrideInput {
  productivityUnit: ProductivityUnit;
  productivity: DecimalString;
  /** Requerido solo cuando la unidad es `unit_per_crew_day`. */
  crewSize?: DecimalString | null;
}

/** Resultado de validar un override (espejo de los errores de la RPC). */
export type ProductivityOverrideValidation =
  | { ok: true; newQuantity: DecimalString; appliedCrewSize: DecimalString | null }
  | { ok: false; error: 'invalid_productivity_unit' | 'invalid_productivity' | 'invalid_crew_size' };

/**
 * Valida una entrada de override y deriva la nueva `quantity` efectiva, con la
 * MISMA semántica que la RPC (espejo en código para la UI/preview). PURA, sin DB.
 *
 *  - `unit_per_crew_day`: exige `crewSize > 0` ⇒ newQuantity = crew_size / productivity.
 *  - `person_day_per_unit`: `productivity` ES el consumo laboral ⇒ newQuantity = productivity;
 *    `crewSize` es opcional (informativo).
 */
export function validateProductivityOverrideInput(
  input: ProductivityOverrideInput,
): ProductivityOverrideValidation {
  if (!PRODUCTIVITY_UNITS.includes(input.productivityUnit)) {
    return { ok: false, error: 'invalid_productivity_unit' };
  }
  if (!isPositive(input.productivity)) {
    return { ok: false, error: 'invalid_productivity' };
  }

  if (input.productivityUnit === 'unit_per_crew_day') {
    if (input.crewSize == null || !isPositive(input.crewSize)) {
      return { ok: false, error: 'invalid_crew_size' };
    }
    return {
      ok: true,
      newQuantity: deriveLaborQuantityFromProductivity(input.crewSize, input.productivity),
      appliedCrewSize: input.crewSize,
    };
  }

  // person_day_per_unit: productivity = consumo laboral directo.
  const appliedCrewSize =
    input.crewSize != null && isPositive(input.crewSize) ? input.crewSize : null;
  return {
    ok: true,
    newQuantity: toDecimalString(toDecimal(input.productivity)),
    appliedCrewSize,
  };
}
