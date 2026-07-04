import { describe, expect, it } from 'vitest';

import { calculateAssumedWasteMl, calculateWastePct, classifyWasteSeverity } from '@/modules/steel';

describe('steel waste', () => {
  it('calcula desperdicio asumido como DecimalString', () => {
    expect(calculateAssumedWasteMl('30', '8')).toBe('2.4');
  });

  it('rechaza desperdicio negativo', () => {
    expect(() => calculateAssumedWasteMl('30', '-1')).toThrow('no puede ser negativo');
  });

  it('calcula porcentaje de desperdicio sin redondeo de presentacion', () => {
    expect(calculateWastePct('30', '2.4')).toBe('8');
  });

  it('clasifica refuerzo con defaults 8/12', () => {
    expect(classifyWasteSeverity('rebar', '7.99')).toBe('ok');
    expect(classifyWasteSeverity('rebar', '8')).toBe('warning');
    expect(classifyWasteSeverity('rebar', '12')).toBe('critical');
  });

  it('clasifica perfiles/metalmecanica con defaults 5/8', () => {
    expect(classifyWasteSeverity('structural_steel', '4.99')).toBe('ok');
    expect(classifyWasteSeverity('structural_steel', '5')).toBe('warning');
    expect(classifyWasteSeverity('structural_steel', '8')).toBe('critical');
  });
});

