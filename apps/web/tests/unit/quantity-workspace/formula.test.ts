/**
 * formula.test.ts — Motor de fórmulas del Quantity Workspace (PURO).
 * Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §2-§3.
 */
import { describe, expect, it } from 'vitest';
import {
  computeQuantityLine,
  QuantityFormulaError,
  isFormulaType,
  sumNet,
} from '@/server/quantity-workspace/formula';
import { buildMixedWallLines } from '@/server/quantity-workspace/templates';

describe('computeQuantityLine — tipos de cálculo', () => {
  it('crea línea de área simple (largo × alto)', () => {
    const r = computeQuantityLine({ formulaType: 'area_simple', length: '3', height: '2' });
    expect(r.resultGross).toBe('6');
    expect(r.resultNet).toBe('6');
  });

  it('crea línea de área de piso (largo × ancho)', () => {
    const r = computeQuantityLine({ formulaType: 'area_floor', length: '4', width: '2.5' });
    expect(r.resultGross).toBe('10');
  });

  it('crea muro con vano (largo × alto − vanos)', () => {
    const r = computeQuantityLine({
      formulaType: 'wall_with_opening',
      length: '5',
      height: '2.4',
      openingDeduction: '1.5',
    });
    expect(r.resultGross).toBe('12');
    expect(r.resultNet).toBe('10.5');
  });

  it('crea enchape por altura (largo × altura_enchape)', () => {
    const r = computeQuantityLine({ formulaType: 'tile_by_height', length: '5', partialHeight: '1.2' });
    expect(r.resultGross).toBe('6');
  });

  it('crea pintura/microcemento por altura restante', () => {
    const r = computeQuantityLine({
      formulaType: 'paint_remainder',
      length: '5',
      height: '2.4',
      partialHeight: '1.2',
    });
    // 5 × (2.4 − 1.2) = 6
    expect(r.resultGross).toBe('6');
  });

  it('crea perfil lineal derivado (longitud aplicable)', () => {
    const r = computeQuantityLine({ formulaType: 'linear_profile', length: '5' });
    expect(r.resultNet).toBe('5');
  });

  it('crea conteo unitario directo', () => {
    const r = computeQuantityLine({ formulaType: 'direct', count: '12' });
    expect(r.resultNet).toBe('12');
  });

  it('crea volumen (largo × ancho × espesor)', () => {
    const r = computeQuantityLine({ formulaType: 'volume', length: '2', width: '3', thickness: '0.1' });
    expect(r.resultGross).toBe('0.6');
  });

  it('aplica desperdicio sobre el neto', () => {
    const r = computeQuantityLine({
      formulaType: 'area_simple',
      length: '10',
      height: '1',
      wastePct: '0.05',
    });
    expect(r.resultNet).toBe('10.5');
  });
});

describe('computeQuantityLine — validaciones de seguridad', () => {
  it('bloquea tipo de fórmula inseguro/no soportado', () => {
    expect(() =>
      // @ts-expect-error — tipo inválido a propósito
      computeQuantityLine({ formulaType: 'eval(1)', length: '1' }),
    ).toThrow(QuantityFormulaError);
  });

  it('bloquea valores negativos inválidos', () => {
    expect(() =>
      computeQuantityLine({ formulaType: 'area_simple', length: '-3', height: '2' }),
    ).toThrow(/negativo/);
  });

  it('bloquea desperdicio fuera de rango (>= 1)', () => {
    expect(() =>
      computeQuantityLine({ formulaType: 'linear_profile', length: '5', wastePct: '1' }),
    ).toThrow(/desperdicio/);
  });

  it('exige dimensiones requeridas por el tipo', () => {
    expect(() =>
      computeQuantityLine({ formulaType: 'area_simple', length: '3' }),
    ).toThrow(QuantityFormulaError);
  });

  it('paint_remainder exige altura total > altura de enchape', () => {
    expect(() =>
      computeQuantityLine({
        formulaType: 'paint_remainder',
        length: '5',
        height: '1.2',
        partialHeight: '1.2',
      }),
    ).toThrow(/altura total/);
  });

  it('neto nunca es negativo aunque el vano supere el bruto', () => {
    const r = computeQuantityLine({
      formulaType: 'wall_with_opening',
      length: '1',
      height: '1',
      openingDeduction: '5',
    });
    expect(r.resultNet).toBe('0');
  });

  it('manual_safe no acepta cadena de fórmula libre: solo suma campos declarados', () => {
    const r = computeQuantityLine({ formulaType: 'manual_safe', length: '2', width: '3' });
    expect(r.resultGross).toBe('5');
  });

  it('isFormulaType discrimina correctamente', () => {
    expect(isFormulaType('area_simple')).toBe(true);
    expect(isFormulaType('rm -rf')).toBe(false);
  });
});

describe('buildMixedWallLines — cantidades derivadas (§3)', () => {
  const lines = buildMixedWallLines({
    length: '5',
    totalHeight: '2.4',
    tileHeight: '1.2',
    openingDeduction: '1',
  });

  it('deriva 4 líneas vinculables por separado', () => {
    expect(lines.map((l) => l.key)).toEqual(['substrate', 'tile', 'profile', 'paint']);
  });

  it('m² board/sustrato = length × total_height − vanos', () => {
    const s = lines.find((l) => l.key === 'substrate')!;
    expect(s.result.resultGross).toBe('12');
    expect(s.result.resultNet).toBe('11');
  });

  it('m² enchape = length × tile_height', () => {
    const t = lines.find((l) => l.key === 'tile')!;
    expect(t.result.resultGross).toBe('6');
  });

  it('ml perfil remate = length', () => {
    const p = lines.find((l) => l.key === 'profile')!;
    expect(p.result.resultNet).toBe('5');
  });

  it('m² pintura/microcemento = length × (total_height − tile_height)', () => {
    const p = lines.find((l) => l.key === 'paint')!;
    expect(p.result.resultGross).toBe('6');
  });
});

describe('sumNet', () => {
  it('suma netos homogéneos', () => {
    expect(
      sumNet([
        { resultGross: '6', resultNet: '6' },
        { resultGross: '4', resultNet: '4' },
      ]),
    ).toBe('10');
  });
});
