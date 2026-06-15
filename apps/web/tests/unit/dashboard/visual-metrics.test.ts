/**
 * visual-metrics.test.ts — Helpers puros de presentación del dashboard
 * (DASHBOARD_VISUAL_DEEP_V1). No calculan finanzas: derivan proporciones visuales.
 */
import { describe, it, expect } from 'vitest';
import { costSplitPct, countActionable } from '@/modules/dashboard/visual-metrics';

describe('costSplitPct', () => {
  it('divide directo/indirecto sobre el total (enteros que suman 100)', () => {
    const s = costSplitPct('800', '1000');
    expect(s.directPct).toBe(80);
    expect(s.indirectPct).toBe(20);
    expect(s.directPct + s.indirectPct).toBe(100);
  });

  it('total 0 o inválido → 0/0 (no divide por cero)', () => {
    expect(costSplitPct('500', '0')).toEqual({ directPct: 0, indirectPct: 0 });
    expect(costSplitPct('500', 'abc')).toEqual({ directPct: 0, indirectPct: 0 });
    expect(costSplitPct(null, null)).toEqual({ directPct: 0, indirectPct: 0 });
  });

  it('acota a [0,100] aunque el directo exceda el total', () => {
    const s = costSplitPct('1500', '1000');
    expect(s.directPct).toBe(100);
    expect(s.indirectPct).toBe(0);
  });

  it('directo negativo/ inválido → 0', () => {
    expect(costSplitPct('-100', '1000').directPct).toBe(0);
  });
});

describe('countActionable', () => {
  it('cuenta solo los > 0 (ignora null/0/negativos)', () => {
    expect(countActionable([3, 0, null, undefined, -2, 5])).toBe(2);
    expect(countActionable([0, null])).toBe(0);
  });
});
