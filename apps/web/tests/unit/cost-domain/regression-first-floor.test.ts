/**
 * regression-first-floor.test.ts — Regresión financiera del motor de costos
 * contra el fixture sanitizado real (ENTRE PATIOS / Primer piso).
 *
 * Propiedad: agent-cost-domain.
 *
 * ORÁCULO OBLIGATORIO: el motor (modules/boq, modules/apu) DEBE reproducir los
 * 9 valores §3.4 dentro de tolerancia (±0.01 COP; ±0.001 m²) PARTIENDO de los
 * datos del fixture (ítems BOQ reales + reglas AIU reales + área), NO de los
 * totales precomputados. Esto demuestra que la cadena
 * BOQ → costos_directos → AIU/IVA → total → valor_m² del dominio es correcta.
 *
 * REGLA: NO se ajustan fórmulas ni tasas para forzar coincidencia. Si algo
 * difiere fuera de tolerancia, el test falla.
 */
import { describe, it, expect } from 'vitest';
import { calculateBoq, calculateEstimateTotals, type IndirectCostRuleInput } from '@/modules/boq';
import { toDecimal } from '@/modules/apu';
import fixture from '../../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';

interface FixtureBoqItem {
  chapterId: string;
  quantitySnapshot: string;
  unitPriceSnapshot: string;
  subtotal: string;
}
interface FixtureIndirectRule {
  code: string;
  name: string;
  percentage: string;
  baseType: 'direct_cost' | 'utility' | 'custom';
  sortOrder: number;
  visibleToClient: boolean;
}

const boqItems = fixture.boqItems as FixtureBoqItem[];
const indirectRules = fixture.indirectCostRules as FixtureIndirectRule[];
const totals = fixture.estimateTotals as Record<string, string>;

/** Diferencia absoluta entre dos strings decimales. */
function diff(a: string, b: string): InstanceType<typeof import('decimal.js').default> {
  return toDecimal(a).minus(toDecimal(b)).abs();
}

// La base del IVA se deriva de baseType + sortOrder (IVA='utility' aplica sobre
// el monto de la última línea direct_cost previa = Utilidad). Sin flags.
const rulesInput: IndirectCostRuleInput[] = indirectRules.map((r) => ({
  code: r.code,
  name: r.name,
  percentage: r.percentage,
  baseType: r.baseType,
  sortOrder: r.sortOrder,
  visibleToClient: r.visibleToClient,
}));

describe('Regresión motor cost-domain — ENTRE PATIOS / Primer piso', () => {
  const boq = calculateBoq(boqItems);
  const result = calculateEstimateTotals({
    directCosts: boq.directCosts,
    indirectRules: rulesInput,
    builtArea: totals['area_construida']!,
  });

  const byCode = Object.fromEntries(result.indirect.lines.map((l) => [l.code, l.amount]));

  it('el fixture trae ítems BOQ reales (> 50) y 4 reglas AIU', () => {
    expect(boqItems.length).toBeGreaterThan(50);
    expect(indirectRules.length).toBe(4);
  });

  it('costos_directos (Σ ítems BOQ del motor) ±0.01 COP', () => {
    expect(diff(boq.directCosts, totals['costos_directos']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('administración ±0.01 COP', () => {
    expect(diff(byCode['A']!, totals['administracion']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('imprevistos ±0.01 COP', () => {
    expect(diff(byCode['I']!, totals['imprevistos']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('utilidad ±0.01 COP', () => {
    expect(diff(byCode['U']!, totals['utilidad']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('IVA sobre utilidad ±0.01 COP', () => {
    expect(diff(byCode['IVA']!, totals['iva_sobre_utilidad']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('costos_indirectos ±0.01 COP', () => {
    expect(diff(result.totalIndirect, totals['costos_indirectos']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('total_costo ±0.01 COP', () => {
    expect(diff(result.totalCost, totals['total_costo']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('área_construida ±0.001 m²', () => {
    expect(diff(result.builtArea, totals['area_construida']!).lessThanOrEqualTo('0.001')).toBe(true);
  });

  it('valor_m² ±0.01 COP/m²', () => {
    expect(diff(result.valuePerSqm, totals['valor_m2']!).lessThanOrEqualTo('0.01')).toBe(true);
  });

  it('invariante: total = directos + indirectos (exacto raw)', () => {
    expect(toDecimal(result.totalCost).toFixed()).toBe(
      toDecimal(result.directCosts).plus(toDecimal(result.totalIndirect)).toFixed(),
    );
  });
});
