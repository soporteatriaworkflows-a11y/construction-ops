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

/**
 * Convierte CUALQUIER entrada (string, number, null) a `Decimal` del dominio SIN
 * lanzar. Devuelve `null` si el valor es nulo, no numérico o no finito
 * (NaN/Infinity). Pensado para blindar el read-model: PostgREST puede serializar
 * `numeric` como número JS o string, y datos imperfectos no deben romper el
 * preview (ver SCHEDULE_PREVIEW_READMODEL_ROOT_CAUSE_V4).
 */
export function tryDecimal(value: unknown): PlanningDecimalInstance | null {
  if (value === null || value === undefined) return null;
  try {
    const d = new PlanningDecimal(value as Decimal.Value);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/**
 * Coerce cualquier entrada a un `DecimalString` finito y NO negativo. Entradas
 * nulas/no numéricas/no finitas o negativas devuelven `'0'`. Nunca lanza. Es el
 * mismo patrón defensivo que los loaders probados (quantity-workspace usa
 * `String(...)`); aquí se centraliza para que ningún consumidor reciba un número
 * JS crudo en una API string-only.
 */
export function toNonNegativeDecimalString(value: unknown): DecimalString {
  const d = tryDecimal(value);
  if (d === null || d.isNegative()) return '0';
  return d.toFixed();
}

/** Suma exacta de dos `DecimalString` (sin float). Entradas inválidas → 0. */
export function addDecimalStrings(a: unknown, b: unknown): DecimalString {
  const da = tryDecimal(a) ?? new PlanningDecimal(0);
  const db = tryDecimal(b) ?? new PlanningDecimal(0);
  return da.plus(db).toFixed();
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
