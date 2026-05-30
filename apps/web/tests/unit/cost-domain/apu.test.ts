/**
 * apu.test.ts — Componentes y costo unitario del APU; frontera de precios.
 * Propiedad: agent-cost-domain.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateApuComponentCost,
  calculateLaborComponentCost,
  calculateToolComponentCost,
  calculateApuUnitCost,
  resolveUnitPriceSnapshot,
  calculateApuComponentWithPort,
  PricingResolutionError,
} from '@/modules/apu';
import { makeFakePricingPort } from './_fakes';

describe('calculateApuComponentCost (regla canónica quantity×(1+waste)×price)', () => {
  it('material con desperdicio: 1.05 × (1+0.08) × 55000 = 62370', () => {
    const r = calculateApuComponentCost({
      componentType: 'material',
      quantity: '1.05',
      wastePct: '0.08',
      unitPriceSnapshot: '55000',
    });
    expect(r).toBe('62370'); // 1.05*1.08=1.134; *55000 = 62370
  });

  it('desperdicio > 0 incrementa el costo respecto a desperdicio 0', () => {
    const conWaste = calculateApuComponentCost({
      componentType: 'material',
      quantity: '10',
      wastePct: '0.08',
      unitPriceSnapshot: '1000',
    });
    const sinWaste = calculateApuComponentCost({
      componentType: 'material',
      quantity: '10',
      wastePct: '0',
      unitPriceSnapshot: '1000',
    });
    expect(conWaste).toBe('10800');
    expect(sinWaste).toBe('10000');
  });

  it('cantidad cero ⇒ costo 0', () => {
    const r = calculateApuComponentCost({
      componentType: 'material',
      quantity: '0',
      wastePct: '0.08',
      unitPriceSnapshot: '55000',
    });
    expect(r).toBe('0');
  });

  it('rechaza cantidad negativa', () => {
    expect(() =>
      calculateApuComponentCost({
        componentType: 'material',
        quantity: '-1',
        wastePct: '0',
        unitPriceSnapshot: '100',
      }),
    ).toThrow();
  });

  it('rechaza desperdicio negativo', () => {
    expect(() =>
      calculateApuComponentCost({
        componentType: 'material',
        quantity: '1',
        wastePct: '-0.01',
        unitPriceSnapshot: '100',
      }),
    ).toThrow();
  });
});

describe('componentes especializados', () => {
  it('mano de obra: horas × costo_hora × cuadrilla', () => {
    expect(calculateLaborComponentCost('8', '12476.5625', '3')).toBe('299437.5');
  });

  it('mano de obra cuadrilla por defecto = 1', () => {
    expect(calculateLaborComponentCost('2', '1000')).toBe('2000');
  });

  it('herramienta = porcentaje × costo_mo_total', () => {
    expect(calculateToolComponentCost('0.05', '299437.5')).toBe('14971.875');
  });

  it('herramienta rechaza porcentaje negativo', () => {
    expect(() => calculateToolComponentCost('-0.01', '1000')).toThrow();
  });
});

describe('calculateApuUnitCost', () => {
  it('suma los costos de componentes', () => {
    expect(calculateApuUnitCost(['62370.00', '6000', '14971.875'])).toBe('83341.875');
  });

  it('APU sin componentes ⇒ 0', () => {
    expect(calculateApuUnitCost([])).toBe('0');
  });
});

describe('frontera de precios (PricingReadPort)', () => {
  const RES = '00000000-0000-4000-8000-000000000041';
  const VER = '00000000-0000-4000-8000-0000000000b1';

  it('resuelve unitPriceSnapshot desde budgetReferencePrice', () => {
    const port = makeFakePricingPort({ [RES]: '56650' });
    expect(resolveUnitPriceSnapshot(port, RES, VER)).toBe('56650');
  });

  it('calcula componente usando el precio aprobado del puerto', () => {
    const port = makeFakePricingPort({ [RES]: '55000' });
    const r = calculateApuComponentWithPort(port, {
      componentType: 'material',
      resourceId: RES,
      estimateVersionId: VER,
      quantity: '1.05',
      wastePct: '0.08',
    });
    expect(r.unitPriceSnapshot).toBe('55000');
    expect(r.totalComponentCost).toBe('62370');
  });

  it('error de dominio no_approved_price cuando no hay precio (no inventa)', () => {
    const port = makeFakePricingPort({});
    try {
      resolveUnitPriceSnapshot(port, RES, VER);
      expect.unreachable('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(PricingResolutionError);
      expect((e as PricingResolutionError).code).toBe('no_approved_price');
    }
  });

  it('error de dominio ambiguous_price', () => {
    const port = makeFakePricingPort({ [RES]: 'AMBIGUOUS' });
    try {
      resolveUnitPriceSnapshot(port, RES, VER);
      expect.unreachable('debió lanzar');
    } catch (e) {
      expect((e as PricingResolutionError).code).toBe('ambiguous_price');
    }
  });
});
