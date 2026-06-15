/**
 * decimal-coercion.test.ts — Blindaje decimal del read-model de planificación
 * (SCHEDULE_PREVIEW_READMODEL_ROOT_CAUSE_V4).
 *
 * Causa raíz reproducida: PostgREST puede serializar `numeric` como NÚMERO JS, y
 * el código de duración era string-only (la suma de rendimiento APU hacía
 * `string.split('.')`, que sobre un número lanza `TypeError`). Esa excepción no
 * tipada caía en el mensaje genérico del preview. Estas pruebas fijan que las
 * primitivas decimales toleran número/string/null sin lanzar.
 */
import { describe, it, expect } from 'vitest';
import {
  tryDecimal,
  toNonNegativeDecimalString,
  addDecimalStrings,
} from '@/modules/planning';

describe('tryDecimal — nunca lanza', () => {
  it('parsea números JS (numeric serializado como number por PostgREST)', () => {
    expect(tryDecimal(1.5)!.toFixed()).toBe('1.5');
    expect(tryDecimal(0)!.toFixed()).toBe('0');
  });

  it('parsea strings decimales', () => {
    expect(tryDecimal('2.25')!.toFixed()).toBe('2.25');
  });

  it('devuelve null para null/undefined/NaN/Infinity/no numérico (sin lanzar)', () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity, 'abc', '', {}, []]) {
      expect(() => tryDecimal(v)).not.toThrow();
      expect(tryDecimal(v as unknown)).toBeNull();
    }
  });
});

describe('toNonNegativeDecimalString', () => {
  it('coerce número JS a DecimalString', () => {
    expect(toNonNegativeDecimalString(3)).toBe('3');
    expect(toNonNegativeDecimalString(1.25)).toBe('1.25');
  });

  it('valores inválidos/no finitos/negativos ⇒ "0" (nunca lanza)', () => {
    expect(toNonNegativeDecimalString(null)).toBe('0');
    expect(toNonNegativeDecimalString(NaN)).toBe('0');
    expect(toNonNegativeDecimalString(Infinity)).toBe('0');
    expect(toNonNegativeDecimalString('-5')).toBe('0');
    expect(toNonNegativeDecimalString('abc')).toBe('0');
  });
});

describe('addDecimalStrings — root cause directo', () => {
  it('suma NÚMEROS JS sin lanzar (antes: number.split → TypeError)', () => {
    // Reproduce el caso de APU con ≥2 componentes labor cuyo quantity llega como
    // número JS desde PostgREST: la suma debe ser exacta, no romper el preview.
    expect(() => addDecimalStrings(0.2 as unknown, 0.3 as unknown)).not.toThrow();
    expect(addDecimalStrings(0.2 as unknown, 0.3 as unknown)).toBe('0.5');
  });

  it('suma strings decimales con precisión exacta', () => {
    expect(addDecimalStrings('1.1', '2.2')).toBe('3.3');
  });

  it('tolera entradas inválidas como 0', () => {
    expect(addDecimalStrings(null, '2')).toBe('2');
    expect(addDecimalStrings('abc', 5 as unknown)).toBe('5');
  });
});
