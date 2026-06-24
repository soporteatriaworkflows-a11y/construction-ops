/**
 * apu-productivity-overrides.test.ts — Conversión/validación PURAS de
 * rendimiento/cuadrilla y estado read-only (APU_PRODUCTIVITY_CREW_OVERRIDES_V1B).
 * Sin DB, sin mutación, sin server action. Solo helpers puros.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveLaborQuantityFromProductivity,
  deriveProductivityFromLaborQuantity,
  validateProductivityOverrideInput,
  PRODUCTIVITY_UNITS,
} from '@/modules/apu/productivity';
import {
  resolveProductivityOverrideStatus,
  formatProductivityDisplay,
} from '@/app/(dashboard)/apu/_lib/apu-productivity-display';

describe('conversión rendimiento ↔ consumo laboral', () => {
  it('labor_quantity = crew_size / productivity', () => {
    expect(deriveLaborQuantityFromProductivity('2', '4')).toBe('0.5');
    expect(deriveLaborQuantityFromProductivity('3', '6')).toBe('0.5');
  });
  it('productivity = crew_size / labor_quantity', () => {
    expect(deriveProductivityFromLaborQuantity('2', '0.5')).toBe('4');
  });
  it('round-trip conserva el valor', () => {
    const q = deriveLaborQuantityFromProductivity('5', '8'); // 0.625
    expect(deriveProductivityFromLaborQuantity('5', q)).toBe('8');
  });
  it('rechaza crew_size <= 0 y productivity <= 0', () => {
    expect(() => deriveLaborQuantityFromProductivity('0', '4')).toThrow();
    expect(() => deriveLaborQuantityFromProductivity('2', '0')).toThrow();
    expect(() => deriveProductivityFromLaborQuantity('-1', '0.5')).toThrow();
  });
});

describe('validateProductivityOverrideInput — unit_per_crew_day', () => {
  it('deriva newQuantity = crew/productivity y conserva crew', () => {
    const r = validateProductivityOverrideInput({
      productivityUnit: 'unit_per_crew_day',
      productivity: '4',
      crewSize: '2',
    });
    expect(r).toEqual({ ok: true, newQuantity: '0.5', appliedCrewSize: '2' });
  });
  it('exige crew_size > 0', () => {
    expect(
      validateProductivityOverrideInput({ productivityUnit: 'unit_per_crew_day', productivity: '4', crewSize: null }),
    ).toEqual({ ok: false, error: 'invalid_crew_size' });
    expect(
      validateProductivityOverrideInput({ productivityUnit: 'unit_per_crew_day', productivity: '4', crewSize: '0' }),
    ).toEqual({ ok: false, error: 'invalid_crew_size' });
  });
});

describe('validateProductivityOverrideInput — person_day_per_unit', () => {
  it('productivity ES el consumo laboral; crew opcional', () => {
    const r = validateProductivityOverrideInput({
      productivityUnit: 'person_day_per_unit',
      productivity: '0.4',
    });
    expect(r).toEqual({ ok: true, newQuantity: '0.4', appliedCrewSize: null });
  });
  it('crew informativo se conserva si es válido', () => {
    const r = validateProductivityOverrideInput({
      productivityUnit: 'person_day_per_unit',
      productivity: '0.4',
      crewSize: '2',
    });
    expect(r).toEqual({ ok: true, newQuantity: '0.4', appliedCrewSize: '2' });
  });
});

describe('validateProductivityOverrideInput — rechazos', () => {
  it('rechaza productivity <= 0', () => {
    expect(
      validateProductivityOverrideInput({ productivityUnit: 'unit_per_crew_day', productivity: '0', crewSize: '2' }),
    ).toEqual({ ok: false, error: 'invalid_productivity' });
  });
  it('rechaza unidad inválida', () => {
    expect(
      validateProductivityOverrideInput({
        // @ts-expect-error unidad inválida a propósito
        productivityUnit: 'per_hour',
        productivity: '4',
        crewSize: '2',
      }),
    ).toEqual({ ok: false, error: 'invalid_productivity_unit' });
  });
  it('PRODUCTIVITY_UNITS = espejo del CHECK de la migración', () => {
    expect([...PRODUCTIVITY_UNITS].sort()).toEqual(['person_day_per_unit', 'unit_per_crew_day']);
  });
});

describe('resolveProductivityOverrideStatus', () => {
  it('material → not_applicable', () => {
    expect(resolveProductivityOverrideStatus({ componentType: 'material', quantity: '5' })).toBe('not_applicable');
  });
  it('labor con source manual/reset', () => {
    expect(resolveProductivityOverrideStatus({ componentType: 'labor', quantity: '0.5', productivitySource: 'manual' })).toBe('manual');
    expect(resolveProductivityOverrideStatus({ componentType: 'labor', quantity: '0.5', productivitySource: 'reset' })).toBe('reset');
  });
  it('labor legacy sin source → inherited (qty>0) / unavailable (qty<=0)', () => {
    expect(resolveProductivityOverrideStatus({ componentType: 'labor', quantity: '0.5' })).toBe('inherited');
    expect(resolveProductivityOverrideStatus({ componentType: 'labor', quantity: '0' })).toBe('unavailable');
  });
});

describe('formatProductivityDisplay', () => {
  it('formatea con unidad', () => {
    expect(formatProductivityDisplay('4', 'unit_per_crew_day')).toBe('4 unidades / día de cuadrilla');
    expect(formatProductivityDisplay('0.4', 'person_day_per_unit')).toBe('0.4 persona·día / unidad');
  });
  it('valores ausentes/no válidos → No disponible', () => {
    expect(formatProductivityDisplay(null)).toBe('No disponible');
    expect(formatProductivityDisplay('0', 'unit_per_crew_day')).toBe('No disponible');
  });
});
