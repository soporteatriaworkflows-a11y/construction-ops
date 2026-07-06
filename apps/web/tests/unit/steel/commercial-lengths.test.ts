/**
 * commercial-lengths.test.ts — Longitudes comerciales editables (F7.1 E).
 *
 * Hoy 6/9/12 m; mañana puede cambiar por proveedor, disponibilidad o decisión
 * de asumir desperdicio. La configuración vive en el takeoff (localStorage) y
 * la consumen el optimizador FFD y el pedido proveedor.
 */
import { describe, expect, it } from 'vitest';
import {
  buildManualCutPlan,
  buildManualOrderDraft,
  computeManualLines,
  DEFAULT_COMMERCIAL_LENGTHS_M,
  effectiveCommercialLengths,
  MAX_COMMERCIAL_LENGTH_M,
  validateCommercialLengthInput,
  type ManualLineRecord,
} from '@/lib/steel/manual-takeoff';
import { parseStoredManualTakeoffs, serializeManualTakeoffs } from '@/lib/steel/manual-store';

function lines(descriptions: readonly string[]): ReturnType<typeof computeManualLines> {
  const records: ManualLineRecord[] = descriptions.map((originalDescription, index) => ({
    id: `l${index + 1}`,
    originalDescription,
    assumedWastePct: '5',
  }));
  return computeManualLines(records);
}

describe('validateCommercialLengthInput', () => {
  it('acepta longitudes validas (incluye coma decimal)', () => {
    expect(validateCommercialLengthInput('7.5')).toEqual({ ok: true, lengthM: '7.5' });
    expect(validateCommercialLengthInput('7,5')).toEqual({ ok: true, lengthM: '7.5' });
    expect(validateCommercialLengthInput(' 12 ')).toEqual({ ok: true, lengthM: '12' });
  });

  it('rechaza 0, negativos, NaN, vacio y fuera de rango fisico', () => {
    expect(validateCommercialLengthInput('0').ok).toBe(false);
    expect(validateCommercialLengthInput('-3').ok).toBe(false);
    expect(validateCommercialLengthInput('abc').ok).toBe(false);
    expect(validateCommercialLengthInput('').ok).toBe(false);
    expect(validateCommercialLengthInput('NaN').ok).toBe(false);
    expect(validateCommercialLengthInput(String(MAX_COMMERCIAL_LENGTH_M + 1)).ok).toBe(false);
  });
});

describe('effectiveCommercialLengths', () => {
  it('sin configuracion ⇒ default 6/9/12 intacto', () => {
    expect(DEFAULT_COMMERCIAL_LENGTHS_M).toEqual(['6', '9', '12']);
    expect(effectiveCommercialLengths(undefined)).toEqual(['6', '9', '12']);
    expect(effectiveCommercialLengths({ commercialLengthsM: undefined })).toEqual(['6', '9', '12']);
  });

  it('configuracion valida ⇒ ordenada y deduplicada; invalida ⇒ se filtra', () => {
    expect(effectiveCommercialLengths({ commercialLengthsM: ['9', '6', '7.5', '7.5'] })).toEqual(['6', '7.5', '9']);
    expect(effectiveCommercialLengths({ commercialLengthsM: ['0', '-1', 'abc'] })).toEqual(['6', '9', '12']);
  });
});

describe('el optimizador y el pedido usan la configuracion (E)', () => {
  // 1#5700 = 1 varilla #5 de 700 cm = 7 m de corte.
  const sevenMeterLine = lines(['1#5700']);

  it('default: un corte de 7 m usa la barra de 9 m', () => {
    const plan = buildManualCutPlan(sevenMeterLine).plan;
    expect(plan.bars).toHaveLength(1);
    expect(plan.bars[0]!.commercialLengthM).toBe('9');
  });

  it('usuario agrega 7.5 m ⇒ el optimizador la usa (menor longitud viable)', () => {
    const plan = buildManualCutPlan(sevenMeterLine, {
      commercialLengthsM: ['6', '7.5', '9', '12'],
    }).plan;
    expect(plan.bars[0]!.commercialLengthM).toBe('7.5');
    // Y el pedido proveedor hereda la barra de 7.5 m.
    const order = buildManualOrderDraft('Takeoff', plan);
    expect(order.lines[0]!.commercialLengthM).toBe('7.5');
  });

  it('usuario elimina 12 m ⇒ un corte de 10 m queda rechazado con advertencia (no se usa 12)', () => {
    const tenMeterLine = lines(['1#51000']); // 1000 cm = 10 m
    const withTwelve = buildManualCutPlan(tenMeterLine).plan;
    expect(withTwelve.bars[0]!.commercialLengthM).toBe('12');

    const withoutTwelve = buildManualCutPlan(tenMeterLine, { commercialLengthsM: ['6', '9'] }).plan;
    expect(withoutTwelve.bars).toHaveLength(0);
    expect(withoutTwelve.rejectedCuts).toHaveLength(1);
    expect(withoutTwelve.rejectedCuts[0]!.reason).toContain('excede las longitudes comerciales');
  });

  it('medidas imposibles (220 m) siguen generando la advertencia de rechazo', () => {
    // Caso real: "L=220" sin unidad se interpreta en metros ⇒ 220 m imposibles.
    const impossible = lines(['#5 L=220']);
    const plan = buildManualCutPlan(impossible).plan;
    expect(plan.rejectedCuts.length).toBeGreaterThan(0);
    expect(plan.rejectedCuts[0]!.reason).toContain('excede las longitudes comerciales');
  });

  it('lista configurada vacia ⇒ cae al default (el optimizador nunca queda sin longitudes)', () => {
    const plan = buildManualCutPlan(sevenMeterLine, { commercialLengthsM: [] }).plan;
    expect(plan.bars[0]!.commercialLengthM).toBe('9');
  });
});

describe('persistencia local de la configuracion (manual-store)', () => {
  it('roundtrip conserva commercialLengthsM y descarta valores corruptos', () => {
    const stored = parseStoredManualTakeoffs(
      serializeManualTakeoffs([
        {
          id: 'mtk-1',
          name: 'Takeoff',
          projectName: 'P',
          scopeLabel: 'S',
          status: 'draft',
          createdAt: '2026-07-05',
          lines: [],
          commercialLengthsM: ['6', '7.5'],
        },
      ]),
    );
    expect(stored[0]!.commercialLengthsM).toEqual(['6', '7.5']);

    const corrupted = parseStoredManualTakeoffs(
      JSON.stringify([
        {
          id: 'mtk-2',
          name: 'T',
          status: 'draft',
          lines: [],
          commercialLengthsM: ['-1', 'abc', 7.5, '9'],
        },
      ]),
    );
    expect(corrupted[0]!.commercialLengthsM).toEqual(['9']);

    const missing = parseStoredManualTakeoffs(
      JSON.stringify([{ id: 'mtk-3', name: 'T', status: 'draft', lines: [] }]),
    );
    expect(missing[0]!.commercialLengthsM).toBeUndefined();
  });
});
