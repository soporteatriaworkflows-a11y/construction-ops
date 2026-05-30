/**
 * decimal.ts — Primitivas decimales del dominio de costos (cost-domain).
 *
 * Propiedad: agent-cost-domain.
 *
 * POLÍTICA Q9 (docs/DECISIONS.md, 2026-05-30): el dominio es la fuente de
 * verdad del cálculo financiero y opera SIEMPRE con `Decimal.js`. Reglas:
 *   - Dinero/cantidades/porcentajes se modelan como `DecimalString` (string).
 *   - PROHIBIDO usar `number`/float de JavaScript para cálculos financieros.
 *   - NO se redondean pasos intermedios; la precisión raw se conserva.
 *   - El redondeo de PRESENTACIÓN (ROUND_HALF_UP, COP sin decimales en UI/PDF
 *     cliente) vive en la capa de salida, NO aquí.
 *
 * Toda función pública del dominio recibe/retorna `DecimalString`. Internamente
 * convierte a `Decimal`, opera y serializa de vuelta con {@link toDecimalString}.
 */

import Decimal from 'decimal.js';
import type { DecimalString } from '@/lib/utils/types';

/**
 * Precisión interna amplia (50 dígitos significativos) para reproducir los
 * dígitos de regresión del golden master sin pérdida. Coincide con la precisión
 * usada por el oráculo de excel-mapper (scripts/golden-master).
 *
 * NO afecta el redondeo de presentación; sólo limita la mantisa interna de
 * Decimal.js, holgadamente por encima de lo que requiere COP.
 */
export const DOMAIN_DECIMAL_PRECISION = 50;

/**
 * Constructor de Decimal del dominio, clonado con precisión y modo de redondeo
 * deterministas. `ROUND_HALF_UP` sólo se aplicaría si una operación excede la
 * precisión interna (no ocurre en pasos intermedios de cuentas COP); el
 * redondeo de presentación es responsabilidad de otra capa.
 */
export const DomainDecimal = Decimal.clone({
  precision: DOMAIN_DECIMAL_PRECISION,
  rounding: Decimal.ROUND_HALF_UP,
});

/** Instancia de Decimal del dominio. */
export type DomainDecimalInstance = InstanceType<typeof DomainDecimal>;

/**
 * Convierte un `DecimalString` a un `Decimal` del dominio.
 *
 * @param value - Valor decimal serializado como string (p. ej. "55000.00").
 * @returns Instancia `Decimal` con la precisión del dominio.
 * @throws Error si `value` no es un decimal finito válido.
 */
export function toDecimal(value: DecimalString): DomainDecimalInstance {
  const d = new DomainDecimal(value);
  if (!d.isFinite()) {
    throw new Error(`Valor decimal no finito o inválido: "${value}"`);
  }
  return d;
}

/**
 * Serializa un `Decimal` a `DecimalString` SIN notación exponencial y sin
 * redondeo de presentación. Preserva todos los dígitos significativos.
 *
 * @param value - Instancia `Decimal`.
 * @returns Representación decimal como string (fuente de verdad).
 */
export function toDecimalString(value: DomainDecimalInstance): DecimalString {
  return value.toFixed();
}

/**
 * Suma una lista de `DecimalString` con precisión completa.
 *
 * @param values - Valores a sumar. Lista vacía ⇒ "0".
 * @returns Suma como `DecimalString`.
 */
export function sumDecimals(values: readonly DecimalString[]): DecimalString {
  const total = values.reduce<DomainDecimalInstance>(
    (acc, v) => acc.plus(toDecimal(v)),
    new DomainDecimal(0),
  );
  return toDecimalString(total);
}

/**
 * Indica si un `DecimalString` es negativo (estrictamente menor que cero).
 *
 * @param value - Valor a evaluar.
 * @returns `true` si `value < 0`.
 */
export function isNegative(value: DecimalString): boolean {
  return toDecimal(value).isNegative();
}

/** Constante "0" como `DecimalString`. */
export const ZERO: DecimalString = '0';
/** Constante "1" como `DecimalString`. */
export const ONE: DecimalString = '1';
