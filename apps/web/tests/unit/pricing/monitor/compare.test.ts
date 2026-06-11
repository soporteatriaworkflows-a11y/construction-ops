/**
 * compare.test.ts — Comparación pura del monitor (Fase 4A, mandato §5.4).
 */
import { describe, it, expect } from 'vitest';
import { compareAgainstBaseline } from '@/server/pricing/monitor/compare';
import type { DetectedPrice, MonitorBaseline } from '@/server/pricing/monitor/types';

function detected(over: Partial<DetectedPrice> = {}): DetectedPrice {
  return {
    price: '169000',
    currency: 'COP',
    unitRaw: null,
    title: 'Demo',
    externalSku: null,
    externalReference: null,
    extractionMethod: 'json-ld',
    confidence: 'high',
    warnings: [],
    ...over,
  };
}

function baseline(over: Partial<MonitorBaseline> = {}): MonitorBaseline {
  return {
    observationId: 'obs-baseline',
    price: '169000',
    currency: 'COP',
    unit: 'm²',
    sourceReference: 'https://shop.example.com/p1',
    ...over,
  };
}

describe('compareAgainstBaseline', () => {
  it('precio idéntico ⇒ unchanged sin warnings', () => {
    const r = compareAgainstBaseline(detected(), baseline());
    expect(r.outcome).toBe('unchanged');
    expect(r.warnings).toEqual([]);
  });

  it('precio Decimal-igual con formato distinto (169000 vs 169000.00) ⇒ unchanged', () => {
    const r = compareAgainstBaseline(detected({ price: '169000.00' }), baseline());
    expect(r.outcome).toBe('unchanged');
  });

  it('precio distinto ⇒ changed', () => {
    const r = compareAgainstBaseline(detected({ price: '175000' }), baseline());
    expect(r.outcome).toBe('changed');
  });

  it('sin baseline ⇒ no_baseline', () => {
    const r = compareAgainstBaseline(detected(), null);
    expect(r.outcome).toBe('no_baseline');
  });

  it('moneda distinta ⇒ changed + warning (no comparable)', () => {
    const r = compareAgainstBaseline(detected({ currency: 'USD' }), baseline());
    expect(r.outcome).toBe('changed');
    expect(r.warnings.join(' ')).toMatch(/Moneda/);
  });

  it('moneda normalizada (cop vs COP) NO genera cambio', () => {
    const r = compareAgainstBaseline(detected({ currency: 'cop' }), baseline());
    expect(r.outcome).toBe('unchanged');
  });

  it('unidad detectada m2 vs baseline m² ⇒ equivalentes, SIN warning falso', () => {
    const r = compareAgainstBaseline(detected({ unitRaw: 'm2' }), baseline({ unit: 'm²' }));
    expect(r.outcome).toBe('unchanged');
    expect(r.warnings).toEqual([]);
  });

  it('unidad realmente distinta (und vs m²) ⇒ changed + warning', () => {
    const r = compareAgainstBaseline(detected({ unitRaw: 'und' }), baseline({ unit: 'm²' }));
    expect(r.outcome).toBe('changed');
    expect(r.warnings.join(' ')).toMatch(/Unidad/);
  });

  it('unidad no detectada (null) ⇒ compara solo precio, sin warning de unidad', () => {
    const r = compareAgainstBaseline(detected({ unitRaw: null }), baseline());
    expect(r.outcome).toBe('unchanged');
    expect(r.warnings).toEqual([]);
  });
});
