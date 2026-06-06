/**
 * aiu-calc.test.ts — Validación y cálculo de AIU (4D.2). Propiedad: agent-db-rls.
 *
 * Verifica: conversión humano↔fracción, validación de rangos, y las fórmulas
 * server-side (Decimal, sin float) contra los valores del golden master.
 */
import { describe, it, expect } from 'vitest';
import {
  validateAiuRates,
  computeFinancialSummary,
  humanToFraction,
  fractionToHuman,
} from '@/server/estimates/aiu-calc';
import { AiuValidationError } from '@/server/estimates/errors';

describe('humano ↔ fracción', () => {
  it('3.5 → 0.035 y vuelta', () => {
    expect(humanToFraction('3.5')).toBe('0.035');
    expect(fractionToHuman('0.035')).toBe('3.5');
  });
  it('19 → 0.19; 0 → 0', () => {
    expect(humanToFraction('19')).toBe('0.19');
    expect(humanToFraction('0')).toBe('0');
  });
});

describe('validateAiuRates', () => {
  it('acepta porcentajes humanos válidos y devuelve fracciones', () => {
    const f = validateAiuRates({ administrationRate: '3.5', contingencyRate: '2.5', utilityRate: '4', utilityVatRate: '19' });
    expect(f).toEqual({ administration: '0.035', contingency: '0.025', utility: '0.04', utilityVat: '0.19' });
  });
  it('3.5 significa 3.5% (no 350%): la fracción es 0.035', () => {
    expect(validateAiuRates({ administrationRate: '3.5', contingencyRate: '0', utilityRate: '0', utilityVatRate: '0' }).administration).toBe('0.035');
  });
  it('negativos bloqueados', () => {
    expect(() => validateAiuRates({ administrationRate: '-1', contingencyRate: '0', utilityRate: '0', utilityVatRate: '0' })).toThrow(AiuValidationError);
  });
  it('valores excesivos (>100%) bloqueados', () => {
    expect(() => validateAiuRates({ administrationRate: '150', contingencyRate: '0', utilityRate: '0', utilityVatRate: '0' })).toThrow(AiuValidationError);
  });
  it('no numéricos bloqueados', () => {
    expect(() => validateAiuRates({ administrationRate: 'abc', contingencyRate: '0', utilityRate: '0', utilityVatRate: '0' })).toThrow(AiuValidationError);
  });
});

describe('computeFinancialSummary — fórmulas (Decimal, sin float)', () => {
  const directTotal = '336084479.93690735'; // golden master §3.4
  const fractions = { administration: '0.035', contingency: '0.025', utility: '0.04', utilityVat: '0.19' };
  const s = computeFinancialSummary(directTotal, fractions);

  it('Administración = directo × 0.035 (golden ±0.01)', () => {
    expect(Math.abs(Number(s.administrationAmount) - 11762956.797791759)).toBeLessThan(0.01);
  });
  it('Imprevistos = directo × 0.025 (golden ±0.01)', () => {
    expect(Math.abs(Number(s.contingencyAmount) - 8402111.998422684)).toBeLessThan(0.01);
  });
  it('Utilidad = directo × 0.04 (golden ±0.01)', () => {
    expect(Math.abs(Number(s.utilityAmount) - 13443379.197476294)).toBeLessThan(0.01);
  });
  it('IVA = utilidad × 0.19 (golden ±0.01)', () => {
    expect(Math.abs(Number(s.utilityVatAmount) - 2554242.047520496)).toBeLessThan(0.01);
  });
  it('Costos indirectos = Σ (golden ±0.01)', () => {
    expect(Math.abs(Number(s.indirectTotal) - 36162690.04121123)).toBeLessThan(0.01);
  });
  it('Total general = directo + indirectos (golden ±0.01)', () => {
    expect(Math.abs(Number(s.grandTotal) - 372247169.9781186)).toBeLessThan(0.01);
  });
  it('IVA se aplica sobre la UTILIDAD, no sobre el directo', () => {
    const utility = Number(s.utilityAmount);
    expect(Math.abs(Number(s.utilityVatAmount) - utility * 0.19)).toBeLessThan(0.01);
  });
  it('sin AIU (fracciones 0) ⇒ total general = costo directo', () => {
    const z = computeFinancialSummary('1000', { administration: '0', contingency: '0', utility: '0', utilityVat: '0' });
    expect(z.grandTotal).toBe('1000');
    expect(z.indirectTotal).toBe('0');
  });
});
