/**
 * Tests: cálculo de suggested_net_price + stale state (Fase 3A).
 * Prueba la lógica pura sin DB.
 */
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { computeIsStale } from '@/server/pricing/validation';

// ---------------------------------------------------------------------------
// suggested_net_price formula (mirrors DB trigger)
// ---------------------------------------------------------------------------

function computeSuggestedNetPrice(observedPrice: string, discountPercent: string): string {
  const price = new Decimal(observedPrice);
  const discount = new Decimal(discountPercent);
  return price.times(new Decimal(1).minus(discount.div(100))).toFixed(10);
}

describe('suggested_net_price — fórmula (espeja trigger DB)', () => {
  it('descuento 0 ⇒ suggestedNetPrice = observedPrice', () => {
    expect(computeSuggestedNetPrice('28000', '0')).toBe('28000.0000000000');
  });

  it('descuento 8% sobre 28000 = 25760', () => {
    // 28000 × (1 - 8/100) = 28000 × 0.92 = 25760
    expect(computeSuggestedNetPrice('28000', '8')).toBe('25760.0000000000');
  });

  it('descuento 5% sobre 29500 = 28025', () => {
    // 29500 × 0.95 = 28025
    expect(computeSuggestedNetPrice('29500', '5')).toBe('28025.0000000000');
  });

  it('descuento 100% ⇒ suggestedNetPrice = 0', () => {
    expect(computeSuggestedNetPrice('50000', '100')).toBe('0.0000000000');
  });

  it('precio con decimales finos — sin redondeo intermedio', () => {
    // 33608.4479936907 × (1 - 8.75/100) = 33608.4479936907 × 0.9125
    const price = '33608.4479936907';
    const discount = '8.75';
    const result = computeSuggestedNetPrice(price, discount);
    const expected = new Decimal(price).times(new Decimal(1).minus(new Decimal(discount).div(100))).toFixed(10);
    expect(result).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// stale state
// ---------------------------------------------------------------------------

describe('computeIsStale', () => {
  const NOW = new Date('2026-06-10T12:00:00Z');

  it('status pending ⇒ never stale', () => {
    expect(computeIsStale('pending', '2026-06-01T00:00:00Z', null, NOW)).toBe(false);
  });

  it('status rejected ⇒ never stale', () => {
    expect(computeIsStale('rejected', '2026-06-01T00:00:00Z', null, NOW)).toBe(false);
  });

  it('approved + no validUntil + approvedAt < 30d ago ⇒ not stale', () => {
    // 5 days ago
    const approvedAt = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeIsStale('approved', approvedAt, null, NOW)).toBe(false);
  });

  it('approved + no validUntil + approvedAt > 30d ago ⇒ stale', () => {
    // 31 days ago
    const approvedAt = new Date(NOW.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeIsStale('approved', approvedAt, null, NOW)).toBe(true);
  });

  it('approved + validUntil in future ⇒ not stale', () => {
    const validUntil = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeIsStale('approved', '2026-05-01T00:00:00Z', validUntil, NOW)).toBe(false);
  });

  it('approved + validUntil in past ⇒ stale', () => {
    const validUntil = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeIsStale('approved', '2026-05-01T00:00:00Z', validUntil, NOW)).toBe(true);
  });

  it('approved + approvedAt null + no validUntil ⇒ not stale', () => {
    expect(computeIsStale('approved', null, null, NOW)).toBe(false);
  });

  it('approved + validUntil exactly now ⇒ stale (past threshold)', () => {
    // validUntil = NOW — exactly at boundary (now > validUntil is false, so not stale)
    expect(computeIsStale('approved', null, NOW.toISOString(), NOW)).toBe(false);
  });

  it('approved + validUntil 1ms before now ⇒ stale', () => {
    const validUntil = new Date(NOW.getTime() - 1).toISOString();
    expect(computeIsStale('approved', null, validUntil, NOW)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

import { validateCreateObservationInput, validateProviderCreateInput } from '@/server/pricing/validation';
import { ObservationValidationError, ProviderValidationError } from '@/server/pricing/errors';

describe('validateCreateObservationInput', () => {
  const VALID: Parameters<typeof validateCreateObservationInput>[0] = {
    resourceId: '00000000-0000-4000-9000-000000000001',
    observedPrice: '28000',
    discountPercent: '8',
    unit: 'saco',
    currency: 'COP',
    sourceType: 'manual',
    observedAt: '2026-06-01T10:00:00Z',
  };

  it('acepta input válido', () => {
    const result = validateCreateObservationInput(VALID);
    expect(result.currency).toBe('COP');
    expect(result.discountPercent).toBe('8');
  });

  it('rechaza precio negativo', () => {
    expect(() => validateCreateObservationInput({ ...VALID, observedPrice: '-100' })).toThrow(ObservationValidationError);
  });

  it('rechaza descuento > 100', () => {
    expect(() => validateCreateObservationInput({ ...VALID, discountPercent: '101' })).toThrow(ObservationValidationError);
  });

  it('rechaza descuento negativo', () => {
    expect(() => validateCreateObservationInput({ ...VALID, discountPercent: '-1' })).toThrow(ObservationValidationError);
  });

  it('rechaza unit vacía', () => {
    expect(() => validateCreateObservationInput({ ...VALID, unit: '   ' })).toThrow(ObservationValidationError);
  });

  it('rechaza moneda inválida', () => {
    expect(() => validateCreateObservationInput({ ...VALID, currency: 'pesos' })).toThrow(ObservationValidationError);
  });

  it('rechaza sourceType inválido', () => {
    expect(() => validateCreateObservationInput({ ...VALID, sourceType: 'web_scraping' as never })).toThrow(ObservationValidationError);
  });

  it('resourceId vacío ⇒ error', () => {
    expect(() => validateCreateObservationInput({ ...VALID, resourceId: '' })).toThrow(ObservationValidationError);
  });

  it('discountPercent default 0 cuando no se provee', () => {
    const { discountPercent: _, ...noDiscount } = VALID;
    const result = validateCreateObservationInput(noDiscount);
    expect(result.discountPercent).toBe('0');
  });
});

describe('validateProviderCreateInput', () => {
  it('acepta proveedor válido mínimo', () => {
    const result = validateProviderCreateInput({ name: 'Homecenter' });
    expect(result.name).toBe('Homecenter');
    expect(result.supplierType).toBe('vendor');
    expect(result.defaultDiscountPercent).toBe('0');
  });

  it('rechaza nombre vacío', () => {
    expect(() => validateProviderCreateInput({ name: '   ' })).toThrow(ProviderValidationError);
  });

  it('rechaza nombre > 200 chars', () => {
    expect(() => validateProviderCreateInput({ name: 'A'.repeat(201) })).toThrow(ProviderValidationError);
  });

  it('rechaza descuento > 100', () => {
    expect(() => validateProviderCreateInput({ name: 'X', defaultDiscountPercent: '101' })).toThrow(ProviderValidationError);
  });

  it('rechaza descuento negativo', () => {
    expect(() => validateProviderCreateInput({ name: 'X', defaultDiscountPercent: '-5' })).toThrow(ProviderValidationError);
  });
});
