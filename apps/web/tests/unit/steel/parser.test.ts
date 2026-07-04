import { describe, expect, it } from 'vitest';

import { parseSteelDescription } from '@/modules/steel';

describe('steel parser', () => {
  it('interpreta 5#5600 como 5 barras #5 de 600 cm con explicacion de convencion', () => {
    const parsed = parseSteelDescription('5#5600');

    expect(parsed.originalDescription).toBe('5#5600');
    expect(parsed.quantityPerUnit).toBe('5');
    expect(parsed.repetitions).toBe('1');
    expect(parsed.barNumber).toBe(5);
    expect(parsed.cutLengthM).toBe('6');
    expect(parsed.confidenceScore).toBe('0.82');
    expect(parsed.needsReview).toBe(false);
    expect(parsed.explanation).toContain('Convencion F1');
  });

  it('interpreta 74E#3200 como 74 estribos #3 de 200 cm', () => {
    const parsed = parseSteelDescription('74E#3200');

    expect(parsed.steelShape).toBe('stirrup');
    expect(parsed.quantityPerUnit).toBe('74');
    expect(parsed.barNumber).toBe(3);
    expect(parsed.cutLengthM).toBe('2');
    expect(parsed.explanation).toContain('74 estribos #3 de 200 cm');
  });

  it('interpreta 2X65E#3182 como 2 grupos de 65 estribos #3 de 182 cm', () => {
    const parsed = parseSteelDescription('2X65E#3182');

    expect(parsed.quantityPerUnit).toBe('65');
    expect(parsed.repetitions).toBe('2');
    expect(parsed.barNumber).toBe(3);
    expect(parsed.cutLengthM).toBe('1.82');
    expect(parsed.explanation).toContain('Cantidad derivada de 2 grupos x 65');
  });

  it('detecta separacion @ cm y la marca para revision', () => {
    const parsed = parseSteelDescription('10#7205 @ 15CM');

    expect(parsed.quantityPerUnit).toBe('10');
    expect(parsed.barNumber).toBe(7);
    expect(parsed.cutLengthM).toBe('2.05');
    expect(parsed.spacingCm).toBe('15');
    expect(parsed.needsReview).toBe(true);
  });

  it('lee longitud explicita en metros', () => {
    const parsed = parseSteelDescription('#4 L=0.62');

    expect(parsed.barNumber).toBe(4);
    expect(parsed.cutLengthM).toBe('0.62');
    expect(parsed.lengthSource).toBe('explicit_m');
  });

  it('suma dobleces segmentados como longitud de origen segmented_length', () => {
    const parsed = parseSteelDescription('15 + 35 + 15');

    expect(parsed.cutLengthM).toBe('0.65');
    expect(parsed.lengthSource).toBe('segmented_length');
    expect(parsed.bendSegmentsM).toEqual(['0.15', '0.35', '0.15']);
  });

  it('conserva descripcion original y devuelve needsReview para patrones desconocidos', () => {
    const parsed = parseSteelDescription('perfil raro sin formato');

    expect(parsed.originalDescription).toBe('perfil raro sin formato');
    expect(parsed.needsReview).toBe(true);
    expect(parsed.confidenceScore).toBe('0');
  });
});

