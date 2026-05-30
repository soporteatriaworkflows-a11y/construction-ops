/**
 * indirect.test.ts — AIU, IVA sobre utilidad, total, valor por m², invariantes.
 * Propiedad: agent-cost-domain.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateIndirectCosts,
  calculateTotal,
  calculateValuePerSqm,
  calculateEstimateTotals,
  type IndirectCostRuleInput,
} from '@/modules/boq';
import { toDecimal } from '@/modules/apu';

// Reglas configurables (tasas del golden master, tomadas como CONFIG no como
// constantes del dominio).
const RULES: IndirectCostRuleInput[] = [
  { code: 'A', name: 'Administración', percentage: '0.035', baseType: 'direct_cost', sortOrder: 0, visibleToClient: true },
  { code: 'I', name: 'Imprevistos', percentage: '0.025', baseType: 'direct_cost', sortOrder: 1, visibleToClient: true },
  { code: 'U', name: 'Utilidad', percentage: '0.04', baseType: 'direct_cost', sortOrder: 2, visibleToClient: true },
  { code: 'IVA', name: 'IVA sobre utilidad', percentage: '0.19', baseType: 'utility', sortOrder: 3, visibleToClient: true },
];

const DIRECT = '336084479.93690735';
const AREA = '236.77900000000005';

describe('calculateIndirectCosts', () => {
  it('aplica cada tasa sobre su base (direct_cost / utility)', () => {
    const r = calculateIndirectCosts(DIRECT, RULES);
    const byCode = Object.fromEntries(r.lines.map((l) => [l.code, l.amount]));
    // IVA se aplica sobre la utilidad (no sobre directos)
    const util = toDecimal(byCode['U']!);
    const iva = toDecimal(byCode['IVA']!);
    expect(iva.toFixed()).toBe(util.times('0.19').toFixed());
  });

  it('reglas con base direct_cost se aplican sobre los costos directos', () => {
    const r = calculateIndirectCosts(DIRECT, RULES);
    const lines = Object.fromEntries(r.lines.map((l) => [l.code, l]));
    for (const code of ['A', 'I', 'U']) {
      expect(lines[code]!.base).toBe(DIRECT);
      expect(toDecimal(lines[code]!.amount).toFixed()).toBe(
        toDecimal(DIRECT).times(lines[code]!.percentage).toFixed(),
      );
    }
  });

  it('regla con base utility se aplica sobre el monto de la Utilidad (base_type, no flag)', () => {
    const r = calculateIndirectCosts(DIRECT, RULES);
    const lines = Object.fromEntries(r.lines.map((l) => [l.code, l]));
    // La base efectiva del IVA debe ser EXACTAMENTE el monto de Utilidad.
    expect(lines['IVA']!.base).toBe(lines['U']!.amount);
  });

  it('orden de cálculo: la base utility usa la última direct_cost previa', () => {
    // Si U no es la última direct_cost antes del IVA, la base cambia.
    const reordered: IndirectCostRuleInput[] = [
      { code: 'U', name: 'Utilidad', percentage: '0.04', baseType: 'direct_cost', sortOrder: 0, visibleToClient: true },
      { code: 'A', name: 'Administración', percentage: '0.035', baseType: 'direct_cost', sortOrder: 1, visibleToClient: true },
      { code: 'IVA', name: 'IVA sobre utilidad', percentage: '0.19', baseType: 'utility', sortOrder: 2, visibleToClient: true },
    ];
    const r = calculateIndirectCosts(DIRECT, reordered);
    const lines = Object.fromEntries(r.lines.map((l) => [l.code, l]));
    // Ahora la última direct_cost previa al IVA es 'A', no 'U'.
    expect(lines['IVA']!.base).toBe(lines['A']!.amount);
  });

  it('regla utility sin una direct_cost previa lanza error', () => {
    const onlyUtility: IndirectCostRuleInput[] = [
      { code: 'IVA', name: 'IVA', percentage: '0.19', baseType: 'utility', sortOrder: 0, visibleToClient: true },
    ];
    expect(() => calculateIndirectCosts(DIRECT, onlyUtility)).toThrow();
  });

  it('las tasas son configurables: cambiarlas cambia los montos', () => {
    const r1 = calculateIndirectCosts(DIRECT, RULES);
    const altered = RULES.map((x) => (x.code === 'A' ? { ...x, percentage: '0.05' } : x));
    const r2 = calculateIndirectCosts(DIRECT, altered);
    expect(r2.totalIndirect).not.toBe(r1.totalIndirect);
  });

  it('rechaza tasa negativa', () => {
    const bad = RULES.map((x) => (x.code === 'A' ? { ...x, percentage: '-0.01' } : x));
    expect(() => calculateIndirectCosts(DIRECT, bad)).toThrow();
  });

  it('baseType custom requiere customBase', () => {
    const custom: IndirectCostRuleInput[] = [
      { code: 'X', name: 'Custom', percentage: '0.1', baseType: 'custom', sortOrder: 0, visibleToClient: true },
    ];
    expect(() => calculateIndirectCosts(DIRECT, custom)).toThrow();
  });
});

describe('total y valor por m²', () => {
  it('total = directos + indirectos', () => {
    const ind = calculateIndirectCosts(DIRECT, RULES);
    const total = calculateTotal(DIRECT, ind.totalIndirect);
    expect(total).toBe(toDecimal(DIRECT).plus(toDecimal(ind.totalIndirect)).toFixed());
  });

  it('valor_m² × área ≈ total (tolerancia de redondeo)', () => {
    const t = calculateEstimateTotals({ directCosts: DIRECT, indirectRules: RULES, builtArea: AREA });
    const reconstructed = toDecimal(t.valuePerSqm).times(AREA);
    const diff = reconstructed.minus(toDecimal(t.totalCost)).abs();
    expect(diff.lessThanOrEqualTo('0.0000001')).toBe(true);
  });

  it('valor por m² rechaza área <= 0', () => {
    expect(() => calculateValuePerSqm('100', '0')).toThrow();
  });
});

describe('invariantes de dominio', () => {
  it('costos_indirectos = A + I + U + IVA', () => {
    const r = calculateIndirectCosts(DIRECT, RULES);
    const sum = r.lines.reduce((acc, l) => acc.plus(l.amount), toDecimal('0'));
    expect(sum.toFixed()).toBe(toDecimal(r.totalIndirect).toFixed());
  });

  it('total_costo = costos_directos + costos_indirectos (siempre)', () => {
    const t = calculateEstimateTotals({ directCosts: DIRECT, indirectRules: RULES, builtArea: AREA });
    expect(toDecimal(t.totalCost).toFixed()).toBe(
      toDecimal(t.directCosts).plus(toDecimal(t.totalIndirect)).toFixed(),
    );
  });
});
