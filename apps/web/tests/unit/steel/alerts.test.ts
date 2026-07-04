import { describe, expect, it } from 'vitest';

import { calculateSteelLine, evaluateSteelLineAlerts } from '@/modules/steel';

describe('steel alerts', () => {
  it('emite alerta de baja confianza y needs_review', () => {
    const line = calculateSteelLine({
      id: 'l1',
      originalDescription: '10#7205 @ 15CM',
      steelFamily: 'rebar',
      steelShape: 'straight',
      cutLengthM: '2.05',
      quantityPerUnit: '10',
      repetitions: '1',
      confidenceScore: '0.78',
      verificationStatus: 'needs_review',
    });

    expect(evaluateSteelLineAlerts(line).map((alert) => alert.code)).toEqual(
      expect.arrayContaining(['A17', 'A4']),
    );
  });

  it('emite critica cuando el corte supera la longitud comercial', () => {
    const line = calculateSteelLine({
      id: 'l2',
      originalDescription: 'manual',
      steelFamily: 'rebar',
      steelShape: 'straight',
      cutLengthM: '13',
      commercialLengthM: '12',
      quantityPerUnit: '1',
      repetitions: '1',
    });

    const alerts = evaluateSteelLineAlerts(line);
    expect(alerts).toContainEqual(
      expect.objectContaining({ code: 'A6', severity: 'critical' }),
    );
  });

  it('emite desperdicio excesivo segun defaults configurables', () => {
    const line = calculateSteelLine({
      id: 'l3',
      originalDescription: 'manual',
      steelFamily: 'rebar',
      steelShape: 'straight',
      cutLengthM: '10',
      quantityPerUnit: '1',
      repetitions: '1',
      wasteMode: 'assumed',
      assumedWastePct: '12',
    });

    expect(evaluateSteelLineAlerts(line)).toContainEqual(
      expect.objectContaining({ code: 'A13', severity: 'critical' }),
    );
  });

  it('detecta ausencia de spec, proveedor y precio', () => {
    const line = calculateSteelLine({
      id: 'l4',
      originalDescription: 'manual',
      steelFamily: 'rebar',
      steelShape: 'straight',
      cutLengthM: '1',
      quantityPerUnit: '1',
      repetitions: '1',
    });

    expect(evaluateSteelLineAlerts(line).map((alert) => alert.code)).toEqual(
      expect.arrayContaining(['A18', 'A9', 'A10']),
    );
  });
});

