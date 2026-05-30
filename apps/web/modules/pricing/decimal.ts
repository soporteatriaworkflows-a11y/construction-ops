/**
 * Configuración y helpers de Decimal.js para el dominio de precios.
 *
 * Q9 (RESUELTA): el cálculo interno conserva precisión completa, sin redondear
 * pasos intermedios. Se usa una instancia de Decimal con alta precisión y
 * `toFixed(SCALE)` SOLO para serializar a `DecimalString` con la escala del
 * esquema (`NUMERIC(20,10)`), de forma determinista y sin pérdida de
 * información relevante. El redondeo `ROUND_HALF_UP` de presentación vive fuera
 * del dominio (UI/exports), NO aquí.
 *
 * Regla global: prohibido `number`/float JS para operaciones financieras.
 */
import Decimal from "decimal.js";

import type { DecimalString } from "@/lib/utils/types";

/**
 * Escala de serialización: NUMERIC(20,10) en DB → 10 decimales en el string.
 * Es la escala canónica del esquema congelado v1 (`docs/DATABASE_SCHEMA.md`).
 */
export const PRICE_SCALE = 10;

/**
 * Instancia de Decimal configurada para el dominio de precios.
 * - `precision` alto para no perder dígitos en operaciones intermedias.
 * - `ROUND_HALF_UP` solo se usa al fijar la escala final de serialización
 *   (10 decimales); NO es redondeo de presentación de cliente.
 */
export const PriceDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -1e9,
  toExpPos: 1e9,
});

export type PriceDecimalValue = InstanceType<typeof PriceDecimal>;

/** Convierte un `DecimalString` a Decimal del dominio (sin redondear). */
export function toDecimal(value: DecimalString | number): PriceDecimalValue {
  // Aceptamos `number` SOLO como literal de origen controlado (p. ej. tests),
  // pero internamente nunca operamos con float: Decimal lo absorbe exacto para
  // enteros y literales decimales seguros. El dominio recibe DecimalString.
  return new PriceDecimal(value);
}

/**
 * Serializa un Decimal a `DecimalString` con la escala canónica del esquema.
 * Determinista: misma entrada ⇒ misma salida (necesario para snapshots y
 * regresión). No introduce redondeo de presentación.
 */
export function toDecimalString(value: PriceDecimalValue): DecimalString {
  return value.toFixed(PRICE_SCALE);
}
