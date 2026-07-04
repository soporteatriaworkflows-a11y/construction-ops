import { describe, expect, it } from 'vitest';

import { calculateSteelLine, findDefaultRebarSpec, lineInputFromParsed, parseSteelDescription } from '@/modules/steel';

describe('steel calculator', () => {
  it('calcula ml, kg y unidades comerciales sin redondear internamente', () => {
    const parsed = parseSteelDescription('5#5600');
    const line = lineInputFromParsed('l1', parsed);
    const calculated = calculateSteelLine(line, findDefaultRebarSpec(5));

    expect(calculated.totalMl).toBe('30');
    expect(calculated.totalKg).toBe('46.56');
    expect(calculated.commercialUnitsRequired).toBe('5');
  });

  it('usa snapshot de peso cuando existe por encima del default spec', () => {
    const calculated = calculateSteelLine({
      id: 'l2',
      originalDescription: 'manual',
      steelFamily: 'rebar',
      steelShape: 'straight',
      cutLengthM: '1.5',
      quantityPerUnit: '2',
      repetitions: '3',
      unitWeightKgMSnapshot: '2',
    });

    expect(calculated.totalMl).toBe('9');
    expect(calculated.totalKg).toBe('18');
  });

  it('calcula costo estimado desde kg y precio snapshot', () => {
    const calculated = calculateSteelLine({
      id: 'l3',
      originalDescription: 'manual',
      steelFamily: 'rebar',
      steelShape: 'straight',
      cutLengthM: '2',
      quantityPerUnit: '5',
      repetitions: '1',
      unitWeightKgMSnapshot: '1.5',
      unitPriceSnapshot: '4000.25',
    });

    expect(calculated.estimatedCost).toBe('60003.75');
  });
});

