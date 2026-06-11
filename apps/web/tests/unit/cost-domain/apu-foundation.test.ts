/**
 * apu-foundation.test.ts — FASE 4B.1 APU_COST_MODEL_FOUNDATION_V1.
 * Propiedad: agent-cost-domain.
 * Contrato: docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md §3, §5, §6, §9, §15.
 *
 * Cubre: rol Ayudante, cuadrilla como suma de integrantes, componente M.O.
 * trazable (falla seguro sin rol), herramienta menor derivada, compatibilidad
 * con herramienta explícita y unidades canónicas reutilizadas.
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calculateLaborCost,
  calculateCrewLaborCost,
  buildCrewLaborComponent,
  calculateApuComponentCost,
  calculateApuUnitCost,
  calculateApuUnitCostFull,
  calculateToolComponentCost,
  toDecimal,
  type LaborRoleFactors,
  type ApuComponentCostEntry,
} from '@/modules/apu';
import { canonicalizeUnit, unitsEquivalent } from '@/server/pricing/units';

// Factores sanitizados (mismos del fixture v2.1.0; NO datos reales de nómina).
const oficial: LaborRoleFactors = {
  baseSalary: '1300000',
  transportSubsidy: '162000',
  benefitsPct: '0.40',
  socialSecurityPct: '0.205',
  payrollTaxPct: '0.09',
  uniformCost: '120000',
  uniformPeriodMonths: '4',
  workingDaysMonth: '24',
  workingHoursDay: '8',
};

const ayudante: LaborRoleFactors = {
  ...oficial,
  baseSalary: '1160000',
};

const OFICIAL_ID = '00000000-0000-4000-8000-000000000080';
const AYUDANTE_ID = '00000000-0000-4000-8000-000000000081';

describe('modelo laboral — Oficial y Ayudante (rol → mensual → día → hora)', () => {
  it('Oficial: costo hora derivado de sus componentes salariales', () => {
    const r = calculateLaborCost(oficial);
    // 1300000×1.695 + 162000 + 30000 = 2395500 → /24 → /8
    expect(r.monthlyIntegralCost).toBe('2395500');
    expect(r.dailyIntegralCost).toBe('99812.5');
    expect(r.hourlyIntegralCost).toBe('12476.5625');
  });

  it('Ayudante: costo hora derivado de sus componentes salariales', () => {
    const r = calculateLaborCost(ayudante);
    // 1160000×1.695 + 162000 + 30000 = 2158200 → /24 = 89925 → /8 = 11240.625
    expect(r.monthlyIntegralCost).toBe('2158200');
    expect(r.dailyIntegralCost).toBe('89925');
    expect(r.hourlyIntegralCost).toBe('11240.625');
  });

  it('componentes salariales preservados: cambiar un factor cambia el derivado', () => {
    const base = calculateLaborCost(ayudante);
    const sinTransporte = calculateLaborCost({ ...ayudante, transportSubsidy: '0' });
    expect(toDecimal(base.monthlyIntegralCost).minus(sinTransporte.monthlyIntegralCost).toFixed())
      .toBe('162000');
  });

  it('raw values preservados: la entrada no se muta', () => {
    const input = { ...ayudante };
    const snapshot = JSON.stringify(input);
    calculateLaborCost(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('usa Decimal (sin float): resultados como DecimalString exactos', () => {
    const r = calculateLaborCost(ayudante);
    // Reconstrucción exacta sin pérdida binaria de float.
    const reconstructed = toDecimal(r.hourlyIntegralCost).times('8').times('24');
    expect(reconstructed.toFixed()).toBe('2158200');
    expect(toDecimal(r.dailyIntegralCost)).toBeInstanceOf(Decimal);
  });
});

describe('cuadrilla — Σ(cantidad integrantes × costo por rol)', () => {
  it('2 Ayudantes + 1 Oficial suma correctamente (base hora)', () => {
    const hourAy = calculateLaborCost(ayudante).hourlyIntegralCost; // 11240.625
    const hourOf = calculateLaborCost(oficial).hourlyIntegralCost; // 12476.5625
    const crew = calculateCrewLaborCost([
      { laborRoleId: AYUDANTE_ID, count: '2', unitCost: hourAy },
      { laborRoleId: OFICIAL_ID, count: '1', unitCost: hourOf },
    ]);
    // 2×11240.625 + 1×12476.5625 = 34957.8125
    expect(crew).toBe('34957.8125');
  });

  it('cuadrilla vacía ⇒ 0; cantidades negativas rechazadas', () => {
    expect(calculateCrewLaborCost([])).toBe('0');
    expect(() =>
      calculateCrewLaborCost([{ count: '-1', unitCost: '100' }]),
    ).toThrow();
  });
});

describe('componente M.O. trazable — buildCrewLaborComponent', () => {
  it('vincula el componente con labor_role_id y congela el costo diario', () => {
    const c = buildCrewLaborComponent({
      laborRoleId: AYUDANTE_ID,
      role: ayudante,
      performanceDays: '0.2',
      memberCount: '2',
    });
    expect(c.laborRoleId).toBe(AYUDANTE_ID);
    expect(c.unitPriceSource).toBe('labor_role');
    expect(c.quantity).toBe('0.4'); // rendimiento × integrantes
    expect(c.unitPriceSnapshot).toBe('89925'); // costo diario Ayudante
    expect(c.totalComponentCost).toBe('35970'); // 0.4 × 89925
  });

  it('falla seguro: componente labor sin vínculo válido al rol lanza', () => {
    expect(() =>
      buildCrewLaborComponent({
        laborRoleId: '' as never,
        role: ayudante,
        performanceDays: '0.2',
        memberCount: '2',
      }),
    ).toThrow(/labor_role_id/);
  });
});

describe('calculateApuUnitCostFull — herramienta menor derivada', () => {
  // Componentes del APU-MURO-LAD del fixture (cuadrilla 2A + 1O).
  const crewApu: ApuComponentCostEntry[] = [
    { componentType: 'material', totalComponentCost: '8820' },
    { componentType: 'labor', totalComponentCost: '35970' },
    { componentType: 'labor', totalComponentCost: '19962.5' },
  ];

  it('material calcula cantidad × precio × (1 + desperdicio)', () => {
    // 0.3 × (1+0.05) × 28000 = 8820 (componente material del APU cuadrilla)
    expect(
      calculateApuComponentCost({
        componentType: 'material',
        quantity: '0.3',
        wastePct: '0.05',
        unitPriceSnapshot: '28000',
      }),
    ).toBe('8820');
  });

  it('desperdicio cero funciona (labor sin waste)', () => {
    expect(
      calculateApuComponentCost({
        componentType: 'labor',
        quantity: '0.4',
        wastePct: '0',
        unitPriceSnapshot: '89925',
      }),
    ).toBe('35970');
  });

  it('herramienta derivada = default_tool_pct × subtotal M.O.', () => {
    const r = calculateApuUnitCostFull(crewApu, '0.05');
    expect(r.labor).toBe('55932.5'); // 35970 + 19962.5
    expect(r.toolDerived).toBe('2796.625'); // 0.05 × 55932.5
    expect(r.tools).toBe('2796.625'); // sin tool explícita
    expect(r.total).toBe('67549.125'); // 8820 + 55932.5 + 2796.625
  });

  it('con defaultToolPct=0 reproduce exactamente calculateApuUnitCost', () => {
    const r = calculateApuUnitCostFull(crewApu, '0');
    const legacy = calculateApuUnitCost(crewApu.map((c) => c.totalComponentCost));
    expect(r.total).toBe(legacy);
    expect(r.toolDerived).toBe('0');
  });

  it('herramienta EXPLÍCITA existente sigue funcionando (fila tool + derivada)', () => {
    const withExplicitTool: ApuComponentCostEntry[] = [
      ...crewApu,
      { componentType: 'tool', totalComponentCost: '1000' },
    ];
    const r = calculateApuUnitCostFull(withExplicitTool, '0.05');
    // tools = explícita 1000 + derivada 2796.625
    expect(r.tools).toBe('3796.625');
    expect(r.total).toBe('68549.125');
    // La derivada NO cambia por la fila tool (se calcula solo sobre labor).
    expect(r.toolDerived).toBe(calculateToolComponentCost('0.05', r.labor));
  });

  it('porcentaje fuera de rango [0,1] rechazado', () => {
    expect(() => calculateApuUnitCostFull(crewApu, '1.5')).toThrow(/rango/);
    expect(() => calculateApuUnitCostFull(crewApu, '-0.01')).toThrow();
  });

  it('no confía en costos negativos (falla seguro)', () => {
    expect(() =>
      calculateApuUnitCostFull(
        [{ componentType: 'material', totalComponentCost: '-1' }],
        '0',
      ),
    ).toThrow();
  });
});

describe('unidades canónicas — reutiliza UNIT_ALIAS_NORMALIZATION_V1', () => {
  it('m2 y m² no generan diferencia semántica', () => {
    expect(unitsEquivalent('m2', 'm²')).toBe(true);
    expect(unitsEquivalent('M2', 'm²')).toBe(true);
    expect(unitsEquivalent('metros cuadrados', 'm2')).toBe(true);
  });

  it('canonicaliza la unidad del APU preservando el raw', () => {
    const u = canonicalizeUnit('m2');
    expect(u.raw).toBe('m2');
    expect(u.canonical).toBe('m²');
    expect(u.recognized).toBe(true);
    expect(canonicalizeUnit('dia').canonical).toBe('día');
    expect(canonicalizeUnit('unidad').canonical).toBe('und');
  });
});
