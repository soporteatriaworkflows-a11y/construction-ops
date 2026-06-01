/**
 * format-cop.ts — Formateo de moneda COP (política Q9).
 *
 * Propiedad: agent-exports.
 *
 * REGLAS (Q9):
 *  - Solo se redondea en PRESENTACIÓN, nunca en snapshots/cálculos.
 *  - PDF cliente / Excel cliente: sin decimales.
 *  - Excel técnico interno: hasta 2 decimales.
 *  - Formato: `Intl.NumberFormat('es-CO')` (separadores de miles y decimal COP).
 *  - La entrada es `DecimalString`; NO se opera como float.
 */

import Decimal from 'decimal.js';

/** Opciones de presentación monetaria. */
export type CopPrecision = 'no-decimals' | 'two-decimals';

/**
 * Formatea un `DecimalString` como moneda COP para presentación.
 * Aplica `ROUND_HALF_UP` solo para truncar la representación visual.
 *
 * @param value - Valor como `DecimalString` (string decimal).
 * @param precision - Número de decimales en la salida.
 * @returns String formateado en pesos COP (ej. "$1.572.129" o "$1.572.129,15").
 */
export function formatCOP(
  value: string,
  precision: CopPrecision = 'no-decimals',
): string {
  const decimals = precision === 'no-decimals' ? 0 : 2;
  const d = new Decimal(value);
  const rounded = d.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(rounded.toNumber());
}

/**
 * Convierte un `DecimalString` a número para escritura en celdas Excel.
 * Aplica `ROUND_HALF_UP` a 2 decimales (máximo para Excel técnico).
 * SOLO para escritura en celdas numéricas; los snapshots permanecen intactos.
 */
export function decimalStringToNumber(
  value: string,
  precision: CopPrecision = 'two-decimals',
): number {
  const decimals = precision === 'no-decimals' ? 0 : 2;
  return new Decimal(value)
    .toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Formatea un porcentaje para presentación (ej. "3.50%").
 */
export function formatPercent(value: string, decimals = 2): string {
  const d = new Decimal(value).mul(100).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  return `${d.toFixed(decimals)}%`;
}
