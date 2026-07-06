/**
 * compact-stirrup-notation.test.ts — F8B P1/P2: nomenclatura decimal compacta
 * de estribos (2x153E#318.4 ⇒ 306 estribos #3 de 184 cm) y verificación por
 * segmentos gráficos del flejado (50+30+12 con simetría = 184 cm).
 */
import { describe, expect, it } from 'vitest';
import { parseSteelDescription } from '@/modules/steel';
import {
  evaluateStirrupSegmentSum,
  normalizeCompactStirrupNotation,
} from '@/lib/steel/dxf/compact-stirrup-notation';

describe('F8B P1 — normalización decimal compacta de estribos', () => {
  it('2x153E#318.4 ⇒ 306 estribos #3 de 1.84 m', () => {
    const result = normalizeCompactStirrupNotation('2x153E#318.4', { structuralContext: true });
    expect(result.applied).toBe(true);
    expect(result.normalizedText).toBe('2x153E#3184');
    expect(result.warnings).toContain('Longitud decimal compacta interpretada como centímetros: 18.4 → 184 cm.');
    expect(result.interpretations[0]).toMatchObject({ barNumber: 3, lengthCm: 184 });
    // El original se preserva SIEMPRE.
    expect(result.originalText).toBe('2x153E#318.4');

    const parsed = parseSteelDescription(result.normalizedText);
    expect(parsed.barNumber).toBe(3);
    expect(parsed.steelShape).toBe('stirrup');
    expect(parsed.cutLengthM).toBe('1.84');
    expect(Number(parsed.quantityPerUnit) * Number(parsed.repetitions)).toBe(306);
  });

  it('2x303E#318.4 ⇒ 606 estribos #3 de 1.84 m', () => {
    const result = normalizeCompactStirrupNotation('2x303E#318.4', { structuralContext: true });
    expect(result.normalizedText).toBe('2x303E#3184');
    const parsed = parseSteelDescription(result.normalizedText);
    expect(parsed.barNumber).toBe(3);
    expect(parsed.cutLengthM).toBe('1.84');
    expect(Number(parsed.quantityPerUnit) * Number(parsed.repetitions)).toBe(606);
  });

  it('E#321.0 ⇒ 210 cm y E#315.6 ⇒ 156 cm', () => {
    const a = normalizeCompactStirrupNotation('E#321.0', { structuralContext: true });
    expect(a.normalizedText).toBe('E#3210');
    expect(a.interpretations[0]?.lengthCm).toBe(210);
    const b = normalizeCompactStirrupNotation('E#315.6', { structuralContext: true });
    expect(b.normalizedText).toBe('E#3156');
    expect(b.interpretations[0]?.lengthCm).toBe(156);
  });

  it('E#318 sin decimal NO se toca (nada cambia silenciosamente)', () => {
    const result = normalizeCompactStirrupNotation('153E#318', { structuralContext: true });
    expect(result.applied).toBe(false);
    expect(result.normalizedText).toBe('153E#318');
    expect(result.warnings).toEqual([]);
  });

  it('E#318.4 fuera de contexto estructural ⇒ requiere revisión, sin normalizar', () => {
    const result = normalizeCompactStirrupNotation('E#318.4', { structuralContext: false });
    expect(result.applied).toBe(false);
    expect(result.normalizedText).toBe('E#318.4');
    expect(result.requiresReview).toBe(true);
    expect(result.warnings.join(' ')).toContain('fuera de contexto');
  });

  it('valores absurdos no se normalizan (rango plausible 30–600 cm)', () => {
    const tiny = normalizeCompactStirrupNotation('E#31.2', { structuralContext: true });
    expect(tiny.applied).toBe(false);
    expect(tiny.requiresReview).toBe(true);
    expect(tiny.warnings.join(' ')).toContain('fuera de rango plausible');
  });

  it('no aplica fuera del patrón de estribo (texto sin E#)', () => {
    const result = normalizeCompactStirrupNotation('VIGA VC-2 L=18.4', { structuralContext: true });
    expect(result.applied).toBe(false);
    expect(result.normalizedText).toBe('VIGA VC-2 L=18.4');
  });
});

describe('F8B P2 — verificación por segmentos gráficos del estribo', () => {
  it('50/30/12 con simetría ⇒ 184 cm confirmados', () => {
    const result = evaluateStirrupSegmentSum([50, 30, 12], 184, { assumeSymmetry: true });
    expect(result.status).toBe('confirmed');
    expect(result.computedCm).toBe(184);
    expect(result.symmetryApplied).toBe(true);
    expect(result.segmentsUsed).toEqual([50, 30, 12, 12, 30, 50]);
    expect(result.message).toContain('confirmada por segmentos gráficos');
    expect(result.message).toContain('184');
  });

  it('50/30/12 vs E#318.4 normalizado (184 cm) ⇒ match', () => {
    const normalized = normalizeCompactStirrupNotation('2x303E#318.4', { structuralContext: true });
    const lengthCm = normalized.interpretations[0]?.lengthCm ?? 0;
    const result = evaluateStirrupSegmentSum([50, 30, 12], lengthCm, { assumeSymmetry: true });
    expect(result.status).toBe('confirmed');
  });

  it('50/30/12 vs E#321.0 (210 cm) ⇒ segment_sum_mismatch', () => {
    const result = evaluateStirrupSegmentSum([50, 30, 12], 210, { assumeSymmetry: true });
    expect(result.status).toBe('segment_sum_mismatch');
    expect(result.message).toContain('El gráfico del estribo suma');
    expect(result.message).toContain('210');
  });

  it('segmentos incompletos sin regla de simetría ⇒ graphic_segment_sum_unverified', () => {
    const result = evaluateStirrupSegmentSum([50, 30], 184, { assumeSymmetry: false });
    expect(result.status).toBe('graphic_segment_sum_unverified');
    expect(result.message).toContain('sin verificar');
  });

  it('sin segmentos suficientes ⇒ unverified (jamás inventa)', () => {
    expect(evaluateStirrupSegmentSum([], 184, { assumeSymmetry: true }).status).toBe('graphic_segment_sum_unverified');
    expect(evaluateStirrupSegmentSum([50], 184, { assumeSymmetry: true }).status).toBe('graphic_segment_sum_unverified');
  });

  it('suma directa exacta confirma sin simetría', () => {
    const result = evaluateStirrupSegmentSum([50, 30, 12, 12, 30, 50], 184, { assumeSymmetry: false });
    expect(result.status).toBe('confirmed');
    expect(result.symmetryApplied).toBe(false);
  });
});
