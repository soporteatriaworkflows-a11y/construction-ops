/**
 * normalize.test.ts — Tests de normalización de datos extraídos (Fase 3B, tests 25–30).
 * Sin red ni DB.
 */
import { describe, it, expect } from 'vitest';
import { normalizeExtraction } from '@/server/pricing/validation/normalize';
import { PriceMissingError } from '@/server/pricing/validation/types';
import type { ExtractedProductData } from '@/server/pricing/validation/types';

const NOW = '2026-06-09T10:00:00.000Z';
const URL = 'https://example.com/product/1';

function base(over: Partial<ExtractedProductData> = {}): ExtractedProductData {
  return {
    title: 'Cemento 50kg',
    rawPrice: '29900',
    currency: 'COP',
    sku: null,
    externalReference: null,
    unit: null,
    extractionMethod: 'json-ld',
    ...over,
  };
}

describe('normalizeExtraction', () => {
  // T25: no inventa unidad
  it('T25 — unit es null cuando no se detectó', () => {
    const p = normalizeExtraction(base({ unit: null }), URL, NOW, 'high');
    expect(p.unit).toBeNull();
  });

  // T26: no inventa SKU
  it('T26 — externalSku es null cuando no se detectó', () => {
    const p = normalizeExtraction(base({ sku: null }), URL, NOW, 'high');
    expect(p.externalSku).toBeNull();
  });

  // T27: sourceType = public_web
  it('T27 — sourceType siempre es public_web', () => {
    const p = normalizeExtraction(base(), URL, NOW, 'high');
    expect(p.sourceType).toBe('public_web');
  });

  // T28: sourceUrl canonicalizada
  it('T28 — sourceUrl refleja la URL canonicalizada', () => {
    const p = normalizeExtraction(base(), URL, NOW, 'high');
    expect(p.sourceUrl).toBe(URL);
  });

  // T29: extractedAt presente
  it('T29 — extractedAt está en la propuesta', () => {
    const p = normalizeExtraction(base(), URL, NOW, 'high');
    expect(p.extractedAt).toBe(NOW);
  });

  // T30a: sin precio → PriceMissingError
  it('T30a — lanza PriceMissingError cuando rawPrice es null', () => {
    expect(() => normalizeExtraction(base({ rawPrice: null }), URL, NOW, 'low'))
      .toThrow(PriceMissingError);
  });

  // T30b: precio inválido → PriceMissingError
  it('T30b — lanza PriceMissingError cuando precio es texto inválido "N/A"', () => {
    expect(() => normalizeExtraction(base({ rawPrice: 'N/A' }), URL, NOW, 'low'))
      .toThrow(PriceMissingError);
  });

  // Extra: precio colombiano con punto como miles ("29.900" → 29900)
  it('parsea "29.900" como 29900 (formato colombiano miles)', () => {
    const p = normalizeExtraction(base({ rawPrice: '29.900' }), URL, NOW, 'high');
    expect(Number(p.observedPrice)).toBe(29900);
  });

  // Extra: precio con coma decimal ("29900,50" → 29900.5)
  it('parsea "29900,50" como 29900.5 (coma decimal)', () => {
    const p = normalizeExtraction(base({ rawPrice: '29900,50' }), URL, NOW, 'high');
    expect(Number(p.observedPrice)).toBeCloseTo(29900.5, 2);
  });

  // Extra: genera warning cuando moneda no detectada
  it('genera warning y usa COP por defecto cuando currency es null', () => {
    const p = normalizeExtraction(base({ currency: null }), URL, NOW, 'medium');
    expect(p.warnings.some((w) => w.includes('Moneda'))).toBe(true);
    expect(p.currency).toBe('COP');
  });

  // Extra: SKU propagado
  it('externalSku propagado cuando sku está presente', () => {
    const p = normalizeExtraction(base({ sku: 'SKU-001' }), URL, NOW, 'high');
    expect(p.externalSku).toBe('SKU-001');
  });

  // Extra: propuesta no tiene status (no es una observación persistida)
  it('la propuesta no tiene campo status (es propuesta, no observación)', () => {
    const p = normalizeExtraction(base(), URL, NOW, 'high');
    expect('status' in p).toBe(false);
  });
});
