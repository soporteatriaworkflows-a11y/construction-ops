/**
 * decimal.test.ts — Primitivas decimales y política Q9 (serialización string).
 * Propiedad: agent-cost-domain.
 */
import { describe, it, expect } from 'vitest';
import {
  toDecimal,
  toDecimalString,
  sumDecimals,
  isNegative,
  DOMAIN_DECIMAL_PRECISION,
} from '@/modules/apu';

describe('primitivas decimales (Q9)', () => {
  it('round-trip string → Decimal → string preserva el valor sin float', () => {
    const raw = '336084479.93690735';
    expect(toDecimalString(toDecimal(raw))).toBe(raw);
  });

  it('no usa float JS: 0.1 + 0.2 === "0.3" exacto', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
    // Sanidad: el float nativo NO daría 0.3.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('serializa sin notación exponencial', () => {
    const s = toDecimalString(toDecimal('0.0000000001'));
    expect(s).toBe('0.0000000001');
    expect(s).not.toMatch(/e/i);
  });

  it('sumDecimals de lista vacía es "0"', () => {
    expect(sumDecimals([])).toBe('0');
  });

  it('mantiene alta precisión en multiplicación (sin redondeo intermedio)', () => {
    // 336084479.93690735 * 0.035 con precisión completa
    const r = toDecimalString(toDecimal('336084479.93690735').times(toDecimal('0.035')));
    expect(r).toBe('11762956.79779175725');
  });

  it('detecta negativos', () => {
    expect(isNegative('-1')).toBe(true);
    expect(isNegative('0')).toBe(false);
    expect(isNegative('5')).toBe(false);
  });

  it('rechaza valores no finitos', () => {
    expect(() => toDecimal('not-a-number')).toThrow();
    expect(() => toDecimal('Infinity')).toThrow();
  });

  it('la precisión del dominio es amplia (>= 50)', () => {
    expect(DOMAIN_DECIMAL_PRECISION).toBeGreaterThanOrEqual(50);
  });
});
