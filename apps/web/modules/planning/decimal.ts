/**
 * decimal.ts — Primitivas decimales del dominio de planificación.
 *
 * Propiedad: agent-planning. Self-contained: NO importa cost-domain
 * (`@/modules/apu`) para no acoplar dominios; usa `decimal.js` directamente.
 *
 * POLÍTICA Q9 (docs/DECISIONS.md): el dominio opera SIEMPRE con `Decimal.js`.
 *   - Duraciones/porcentajes/holguras se modelan como `DecimalString` (string).
 *   - PROHIBIDO usar `number`/float de JS para cálculos de planificación.
 *   - NO se redondean pasos intermedios; la precisión raw se conserva.
 *   - El redondeo de PRESENTACIÓN vive en la capa de salida (UI), no aquí.
 *
 * Las fechas se manejan en días enteros (cronograma a granularidad de día). Las
 * conversiones fecha↔día usan UTC mediodía para evitar derivas por zona horaria
 * (ver `date.ts`); este módulo solo cubre la aritmética decimal de duraciones.
 */

import Decimal from 'decimal.js';
import type { DecimalString } from '@/lib/utils/types';

/**
 * Precisión interna amplia (40 dígitos significativos), holgada para duraciones
 * y holguras de cronograma. No afecta el redondeo de presentación.
 */
export const PLANNING_DECIMAL_PRECISION = 40;

/** Constructor de Decimal del dominio de planificación, determinista. */
export const PlanningDecimal = Decimal.clone({
  precision: PLANNING_DECIMAL_PRECISION,
  rounding: Decimal.ROUND_HALF_UP,
});

/** Instancia de Decimal del dominio de planificación. */
export type PlanningDecimalInstance = InstanceType<typeof PlanningDecimal>;

/**
 * Convierte un `DecimalString` a `Decimal` del dominio.
 *
 * @param value - Valor decimal serializado como string.
 * @returns Instancia `Decimal`.
 * @throws Error si `value` no es un decimal finito válido.
 */
export function toDecimal(value: DecimalString): PlanningDecimalInstance {
  const d = new PlanningDecimal(value);
  if (!d.isFinite()) {
    throw new Error(`Valor decimal no finito o inválido: "${value}"`);
  }
  return d;
}

/**
 * Serializa un `Decimal` a `DecimalString` SIN notación exponencial y sin
 * redondeo de presentación.
 *
 * @param value - Instancia `Decimal`.
 * @returns Representación decimal como string.
 */
export function toDecimalString(value: PlanningDecimalInstance): DecimalString {
  return value.toFixed();
}

/** Constante "0" como `DecimalString`. */
export const ZERO: DecimalString = '0';

/** `true` si `a < b`. */
export function lt(a: DecimalString, b: DecimalString): boolean {
  return toDecimal(a).lt(toDecimal(b));
}

/** `true` si `a > b`. */
export function gt(a: DecimalString, b: DecimalString): boolean {
  return toDecimal(a).gt(toDecimal(b));
}

/** `true` si `a == b` (igualdad decimal exacta). */
export function eq(a: DecimalString, b: DecimalString): boolean {
  return toDecimal(a).eq(toDecimal(b));
}

/** `true` si el valor es estrictamente negativo. */
export function isNegative(value: DecimalString): boolean {
  return toDecimal(value).isNegative();
}

/** Devuelve el menor de dos `DecimalString`. */
export function min(a: DecimalString, b: DecimalString): DecimalString {
  return lt(a, b) ? a : b;
}

/** Devuelve el mayor de dos `DecimalString`. */
export function max(a: DecimalString, b: DecimalString): DecimalString {
  return gt(a, b) ? a : b;
}
