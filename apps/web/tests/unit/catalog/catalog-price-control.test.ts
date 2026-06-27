/**
 * catalog-price-control.test.ts — V5.2.1 centro de control de precios (UI/UX, datos existentes).
 * Lógica PURA (priceAgeDays/isOldPrice/filterResources) + checks de fuente. Sin backend.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  priceAgeDays,
  isOldPrice,
  filterResources,
  PRICE_OLD_THRESHOLD_DAYS,
  type CatalogFilters,
} from '../../../app/(dashboard)/catalog/catalog-explorer';
import type { CatalogResourceView } from '@/server/read-model/types';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const NOW = new Date('2026-06-27T00:00:00Z');

function res(p: Partial<CatalogResourceView>): CatalogResourceView {
  return { id: p.id ?? 'r1', code: p.code ?? 'C1', name: p.name ?? 'Rec', resourceType: p.resourceType ?? ('material' as never), unit: p.unit ?? 'm3', ...p } as CatalogResourceView;
}
const F = (o: Partial<CatalogFilters>): CatalogFilters => ({ search: '', type: 'all', status: 'all', provider: 'all', age: 'all', ...o });

describe('V5.2.1 — antigüedad de precio (heurística UI, no autoritativo)', () => {
  it('priceAgeDays / isOldPrice con umbral 90d', () => {
    expect(PRICE_OLD_THRESHOLD_DAYS).toBe(90);
    expect(priceAgeDays(null)).toBeNull();
    expect(priceAgeDays('2026-06-17T00:00:00Z', NOW)).toBe(10);
    expect(isOldPrice('2026-06-17T00:00:00Z')).toBe(false);
    expect(isOldPrice('2026-01-01T00:00:00Z')).toBe(true); // >90d
  });
});

describe('V5.2.1 — filtros operativos (provider=missing, age=old/nodate)', () => {
  const data = [
    res({ id: 'a', supplierName: 'ACME', priceDate: '2026-06-20T00:00:00Z', priceStatus: 'approved' }),
    res({ id: 'b', priceDate: '2025-01-01T00:00:00Z', priceStatus: 'pending' }), // sin proveedor + antiguo
    res({ id: 'c', priceStatus: 'none' }), // sin fecha
  ];
  it('provider=missing → solo sin proveedor', () => {
    expect(filterResources(data, F({ provider: 'missing' })).map((r) => r.id)).toEqual(['b', 'c']);
  });
  it('age=old → solo precios antiguos', () => {
    expect(filterResources(data, F({ age: 'old' })).map((r) => r.id)).toEqual(['b']);
  });
  it('age=nodate → solo sin fecha', () => {
    expect(filterResources(data, F({ age: 'nodate' })).map((r) => r.id)).toEqual(['c']);
  });
  it('age opcional ausente = no filtra (compat)', () => {
    expect(filterResources(data, { search: '', type: 'all', status: 'all', provider: 'all' }).length).toBe(3);
  });
});

describe('V5.2.1 — KPIs accionables (deep-links) y filtros sembrados', () => {
  it('page KPI band con href de estado/proveedor/antigüedad + Precios antiguos', () => {
    const page = read('../../../app/(dashboard)/catalog/page.tsx');
    for (const h of ['/catalog?status=approved', '/catalog?status=pending', '/catalog?status=none', '/catalog?provider=missing', '/catalog?age=old']) {
      expect(page).toContain(h);
    }
    expect(page).toContain('Precios antiguos');
    expect(page).toContain('initialStatus={initStatus}');
  });
  it('explorer acepta filtros iniciales (sin backend) + filtro Antigüedad/Sin proveedor', () => {
    const exp = read('../../../app/(dashboard)/catalog/catalog-explorer.tsx');
    expect(exp).toContain('initialStatus');
    expect(exp).toContain("'missing', 'Sin proveedor'");
    expect(exp).toContain('Antigüedad del precio');
  });
});
