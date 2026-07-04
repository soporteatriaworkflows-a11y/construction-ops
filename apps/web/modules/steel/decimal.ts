import Decimal from 'decimal.js';

import type { DecimalString } from '@/lib/utils/types';

export const STEEL_DECIMAL_PRECISION = 50;

export const SteelDecimal = Decimal.clone({
  precision: STEEL_DECIMAL_PRECISION,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -1e9,
  toExpPos: 1e9,
});

export type SteelDecimalInstance = InstanceType<typeof SteelDecimal>;

export const ZERO: DecimalString = '0';
export const ONE: DecimalString = '1';

export function toDecimal(value: DecimalString | number): SteelDecimalInstance {
  const decimal = new SteelDecimal(value);
  if (!decimal.isFinite()) {
    throw new Error(`Valor decimal no finito o invalido: "${String(value)}"`);
  }
  return decimal;
}

export function toDecimalString(value: SteelDecimalInstance): DecimalString {
  return value.toFixed();
}

export function addDecimalStrings(values: readonly DecimalString[]): DecimalString {
  return toDecimalString(values.reduce((acc, value) => acc.plus(toDecimal(value)), new SteelDecimal(0)));
}

export function multiplyDecimalStrings(left: DecimalString, right: DecimalString): DecimalString {
  return toDecimalString(toDecimal(left).times(toDecimal(right)));
}

export function divideDecimalStrings(left: DecimalString, right: DecimalString): DecimalString {
  const divisor = toDecimal(right);
  if (divisor.isZero()) {
    throw new Error('Division por cero en dominio steel');
  }
  return toDecimalString(toDecimal(left).div(divisor));
}

export function decimalMax(left: DecimalString, right: DecimalString): DecimalString {
  return toDecimal(left).gte(toDecimal(right)) ? left : right;
}

