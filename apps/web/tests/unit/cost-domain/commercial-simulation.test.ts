/**
 * commercial-simulation.test.ts — Simulador Comercial V1 (dominio puro).
 *
 * Cubre: fórmula del contrato, porcentajes inválidos, base cero, precio
 * objetivo (3 estados), pureza (sin mutación de la entrada) y precisión Decimal.
 */
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  simulateCommercialPrice,
  CommercialSimulationValidationError,
  COMMERCIAL_SIMULATION_DISCLAIMER,
  type CommercialSimulationInput,
} from '@/modules/estimates/commercial-simulation';

const GM_TOTAL = '372247169.9781186'; // golden master COP 372.247.170

function base(input: Partial<CommercialSimulationInput> = {}): CommercialSimulationInput {
  return {
    baseTotal: GM_TOTAL,
    commercialAdjustmentPct: '0',
    discountPct: '0',
    additionalTaxPct: '0',
    targetPrice: null,
    ...input,
  };
}

describe('simulateCommercialPrice — fórmula del contrato', () => {
  it('sin ajustes: precio final = base (identidad)', () => {
    const r = simulateCommercialPrice(base());
    expect(r.commercialSubtotal).toBe(new Decimal(GM_TOTAL).toFixed());
    expect(r.discountAmount).toBe('0');
    expect(r.additionalTaxAmount).toBe('0');
    expect(r.finalPrice).toBe(new Decimal(GM_TOTAL).toFixed());
  });

  it('aplica ajuste, descuento e impuesto en cadena (caso 10/5/19 sobre 100.000)', () => {
    const r = simulateCommercialPrice(
      base({ baseTotal: '100000', commercialAdjustmentPct: '10', discountPct: '5', additionalTaxPct: '19' }),
    );
    // subtotal_comercial = 100000 × 1.10 = 110000
    expect(r.commercialSubtotal).toBe('110000');
    // descuento = 110000 × 0.05 = 5500
    expect(r.discountAmount).toBe('5500');
    // subtotal_con_descuento = 104500
    expect(r.subtotalAfterDiscount).toBe('104500');
    // impuesto = 104500 × 0.19 = 19855
    expect(r.additionalTaxAmount).toBe('19855');
    // precio_final = 124355
    expect(r.finalPrice).toBe('124355');
  });

  it('ajuste comercial negativo (rebaja) permitido', () => {
    const r = simulateCommercialPrice(base({ baseTotal: '100000', commercialAdjustmentPct: '-10' }));
    expect(r.commercialSubtotal).toBe('90000');
    expect(r.finalPrice).toBe('90000');
  });

  it('precisión Decimal: sin redondeo flotante sobre el total golden master', () => {
    const r = simulateCommercialPrice(base({ commercialAdjustmentPct: '3.5' }));
    const expected = new Decimal(GM_TOTAL).times(new Decimal('1.035')).toFixed();
    expect(r.commercialSubtotal).toBe(expected);
    expect(r.finalPrice).toBe(expected);
  });

  it('acepta coma decimal y sufijo % (formato humano es-CO)', () => {
    const r = simulateCommercialPrice(
      base({ baseTotal: '100000', commercialAdjustmentPct: '10,5 %', discountPct: '0', additionalTaxPct: '0' }),
    );
    expect(r.commercialSubtotal).toBe('110500');
  });
});

describe('simulateCommercialPrice — base cero', () => {
  it('base cero produce todos los montos en cero (sin división ni NaN)', () => {
    const r = simulateCommercialPrice(
      base({ baseTotal: '0', commercialAdjustmentPct: '10', discountPct: '5', additionalTaxPct: '19' }),
    );
    expect(r.commercialSubtotal).toBe('0');
    expect(r.discountAmount).toBe('0');
    expect(r.subtotalAfterDiscount).toBe('0');
    expect(r.additionalTaxAmount).toBe('0');
    expect(r.finalPrice).toBe('0');
  });

  it('base cero con objetivo > 0 ⇒ below_target', () => {
    const r = simulateCommercialPrice(base({ baseTotal: '0', targetPrice: '1000' }));
    expect(r.targetStatus).toBe('below_target');
    expect(r.targetDifference).toBe('-1000');
  });
});

describe('simulateCommercialPrice — precio objetivo', () => {
  it('sin objetivo ⇒ campos de objetivo en null', () => {
    const r = simulateCommercialPrice(base({ targetPrice: null }));
    expect(r.targetPrice).toBeNull();
    expect(r.targetDifference).toBeNull();
    expect(r.targetStatus).toBeNull();
  });

  it('objetivo vacío ("") ⇒ sin objetivo', () => {
    const r = simulateCommercialPrice(base({ targetPrice: '' }));
    expect(r.targetStatus).toBeNull();
  });

  it('precio final igual al objetivo ⇒ on_target y diferencia 0', () => {
    const r = simulateCommercialPrice(base({ baseTotal: '100000', targetPrice: '100000' }));
    expect(r.targetStatus).toBe('on_target');
    expect(r.targetDifference).toBe('0');
  });

  it('precio final por encima del objetivo ⇒ above_target con diferencia positiva', () => {
    const r = simulateCommercialPrice(
      base({ baseTotal: '100000', commercialAdjustmentPct: '10', targetPrice: '100000' }),
    );
    expect(r.targetStatus).toBe('above_target');
    expect(r.targetDifference).toBe('10000');
  });

  it('precio final por debajo del objetivo ⇒ below_target con diferencia negativa', () => {
    const r = simulateCommercialPrice(
      base({ baseTotal: '100000', discountPct: '10', targetPrice: '100000' }),
    );
    expect(r.targetStatus).toBe('below_target');
    expect(r.targetDifference).toBe('-10000');
  });
});

describe('simulateCommercialPrice — validación', () => {
  function issuesOf(input: CommercialSimulationInput) {
    try {
      simulateCommercialPrice(input);
      return null;
    } catch (e) {
      if (e instanceof CommercialSimulationValidationError) return e.issues;
      throw e;
    }
  }

  it('porcentajes no numéricos ⇒ error de validación por campo', () => {
    const issues = issuesOf(
      base({ commercialAdjustmentPct: 'abc', discountPct: 'x', additionalTaxPct: '1.2.3' }),
    );
    expect(issues).not.toBeNull();
    const fields = issues!.map((i) => i.field);
    expect(fields).toContain('commercialAdjustmentPct');
    expect(fields).toContain('discountPct');
    expect(fields).toContain('additionalTaxPct');
  });

  it('descuento negativo ⇒ inválido (no admite signo)', () => {
    const issues = issuesOf(base({ discountPct: '-5' }));
    expect(issues!.some((i) => i.field === 'discountPct')).toBe(true);
  });

  it('descuento > 100% ⇒ inválido', () => {
    const issues = issuesOf(base({ discountPct: '101' }));
    expect(issues!.some((i) => i.field === 'discountPct')).toBe(true);
  });

  it('impuesto > 100% ⇒ inválido', () => {
    const issues = issuesOf(base({ additionalTaxPct: '100.01' }));
    expect(issues!.some((i) => i.field === 'additionalTaxPct')).toBe(true);
  });

  it('ajuste fuera de [−100, 100] ⇒ inválido', () => {
    expect(issuesOf(base({ commercialAdjustmentPct: '-100.5' }))).not.toBeNull();
    expect(issuesOf(base({ commercialAdjustmentPct: '150' }))).not.toBeNull();
  });

  it('base negativa o no numérica ⇒ inválida', () => {
    expect(issuesOf(base({ baseTotal: '-1' }))!.some((i) => i.field === 'baseTotal')).toBe(true);
    expect(issuesOf(base({ baseTotal: 'nope' }))!.some((i) => i.field === 'baseTotal')).toBe(true);
  });

  it('precio objetivo negativo o no numérico ⇒ inválido', () => {
    expect(issuesOf(base({ targetPrice: '-100' }))!.some((i) => i.field === 'targetPrice')).toBe(true);
    expect(issuesOf(base({ targetPrice: 'abc' }))!.some((i) => i.field === 'targetPrice')).toBe(true);
  });

  it('porcentajes vacíos se tratan como 0 (no error)', () => {
    const r = simulateCommercialPrice(
      base({ commercialAdjustmentPct: '', discountPct: '', additionalTaxPct: '' }),
    );
    expect(r.finalPrice).toBe(new Decimal(GM_TOTAL).toFixed());
  });
});

describe('simulateCommercialPrice — pureza y no-modificación', () => {
  it('no muta la entrada (la simulación jamás toca BOQ/AIU/exports)', () => {
    const input = base({ baseTotal: '100000', commercialAdjustmentPct: '10', targetPrice: '120000' });
    const frozen = JSON.stringify(input);
    simulateCommercialPrice(input);
    expect(JSON.stringify(input)).toBe(frozen);
  });

  it('es determinista (misma entrada ⇒ mismo resultado)', () => {
    const input = base({ commercialAdjustmentPct: '7.25', discountPct: '12.5', additionalTaxPct: '19' });
    expect(simulateCommercialPrice(input)).toEqual(simulateCommercialPrice(input));
  });

  it('expone el disclaimer obligatorio del contrato', () => {
    expect(COMMERCIAL_SIMULATION_DISCLAIMER).toMatch(/no modifica el presupuesto técnico/);
  });
});
