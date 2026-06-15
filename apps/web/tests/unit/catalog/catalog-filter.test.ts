/**
 * catalog-filter.test.ts — Filtro puro del explorador de catálogo
 * (ICONIC_OPS_UX_BLOCKERS_V1). Solo presentación; no toca read-model ni precios.
 */
import { describe, it, expect } from 'vitest';
import { filterResources, type CatalogFilters } from '@/app/(dashboard)/catalog/catalog-explorer';
import type { CatalogResourceView } from '@/lib/contracts/read-model';

const NONE: CatalogFilters = { search: '', type: 'all', status: 'all', provider: 'all' };

function res(over: Partial<CatalogResourceView> & { id: string }): CatalogResourceView {
  return {
    code: 'COD',
    name: 'Recurso',
    unit: 'm3',
    resourceType: 'material',
    priceStatus: 'approved',
    supplierName: 'Homecenter',
    approvedPrice: '1000',
    pendingPrice: undefined,
    priceDate: '2026-06-01',
    ...over,
  } as CatalogResourceView;
}

const R = [
  res({ id: '1', code: 'CEM-01', name: 'Cemento gris', resourceType: 'material', priceStatus: 'approved', supplierName: 'Homecenter' }),
  res({ id: '2', code: 'MO-01', name: 'Oficial albañil', unit: 'día', resourceType: 'labor', priceStatus: 'pending', supplierName: undefined }),
  res({ id: '3', code: 'EQ-01', name: 'Mezcladora', resourceType: 'equipment', priceStatus: 'none', supplierName: 'Ferrekátua' }),
];

describe('filterResources', () => {
  it('sin filtros devuelve todo', () => {
    expect(filterResources(R, NONE)).toHaveLength(3);
  });
  it('búsqueda por código/nombre/unidad (case-insensitive)', () => {
    expect(filterResources(R, { ...NONE, search: 'cemento' }).map((r) => r.id)).toEqual(['1']);
    expect(filterResources(R, { ...NONE, search: 'mo-01' }).map((r) => r.id)).toEqual(['2']);
    expect(filterResources(R, { ...NONE, search: 'día' }).map((r) => r.id)).toEqual(['2']);
  });
  it('filtro por tipo', () => {
    expect(filterResources(R, { ...NONE, type: 'labor' }).map((r) => r.id)).toEqual(['2']);
  });
  it('filtro por estado de precio (none por defecto)', () => {
    expect(filterResources(R, { ...NONE, status: 'none' }).map((r) => r.id)).toEqual(['3']);
    expect(filterResources(R, { ...NONE, status: 'approved' }).map((r) => r.id)).toEqual(['1']);
  });
  it('filtro por proveedor', () => {
    expect(filterResources(R, { ...NONE, provider: 'Homecenter' }).map((r) => r.id)).toEqual(['1']);
  });
  it('combina filtros (AND)', () => {
    expect(filterResources(R, { ...NONE, type: 'material', status: 'approved', search: 'cem' }).map((r) => r.id)).toEqual(['1']);
    expect(filterResources(R, { ...NONE, type: 'material', status: 'pending' })).toHaveLength(0);
  });
});
