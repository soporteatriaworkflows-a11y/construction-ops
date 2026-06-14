/**
 * price-status.test.ts — Visibilidad de precios de catálogo (CATALOG_PRICE_VISIBILITY_V1).
 * Contrato: docs/QUANTITY_WORKSPACE_AND_BOQ_SYNC_V1_CONTRACT.md §5.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveCatalogPriceStatus,
  projectPriceStatusForRole,
  type PriceObservationRow,
} from '@/server/catalog/price-status';

const obs = (
  status: PriceObservationRow['status'],
  price: string,
  effectiveAt: string,
  supplierName: string | null = 'Homecenter',
): PriceObservationRow => ({ status, observedPrice: price, supplierName, effectiveAt });

describe('resolveCatalogPriceStatus', () => {
  it('muestra precio aprobado cuando existe', () => {
    const r = resolveCatalogPriceStatus([
      obs('approved', '103000', '2026-06-10T00:00:00Z'),
      obs('pending', '110000', '2026-06-12T00:00:00Z'),
    ]);
    expect(r.priceStatus).toBe('approved');
    expect(r.approvedPrice).toBe('103000');
    expect(r.priceDate).toBe('2026-06-10T00:00:00Z');
    expect(r.supplierName).toBe('Homecenter');
  });

  it('toma el aprobado más reciente', () => {
    const r = resolveCatalogPriceStatus([
      obs('approved', '100000', '2026-06-01T00:00:00Z'),
      obs('approved', '105000', '2026-06-09T00:00:00Z'),
    ]);
    expect(r.approvedPrice).toBe('105000');
  });

  it('muestra pendiente cuando no hay aprobado', () => {
    const r = resolveCatalogPriceStatus([obs('pending', '110000', '2026-06-12T00:00:00Z')]);
    expect(r.priceStatus).toBe('pending');
    expect(r.pendingPrice).toBe('110000');
    expect(r.approvedPrice).toBeUndefined();
  });

  it('muestra "sin precio aprobado" (none) cuando no hay observaciones', () => {
    const r = resolveCatalogPriceStatus([]);
    expect(r.priceStatus).toBe('none');
    expect(r.approvedPrice).toBeUndefined();
    expect(r.pendingPrice).toBeUndefined();
  });

  it('marca rejected si la única observación fue rechazada', () => {
    const r = resolveCatalogPriceStatus([obs('rejected', '99000', '2026-06-05T00:00:00Z')]);
    expect(r.priceStatus).toBe('rejected');
  });

  it('NO autoaprueba: pendiente nunca se reporta como approved', () => {
    const r = resolveCatalogPriceStatus([obs('pending', '110000', '2026-06-12T00:00:00Z')]);
    expect(r.priceStatus).not.toBe('approved');
  });
});

describe('projectPriceStatusForRole — privacidad de proveedor', () => {
  const base = resolveCatalogPriceStatus([obs('approved', '103000', '2026-06-10T00:00:00Z')]);

  it('roles internos ven el proveedor', () => {
    expect(projectPriceStatusForRole(base, 'management').supplierName).toBe('Homecenter');
    expect(projectPriceStatusForRole(base, 'internal').supplierName).toBe('Homecenter');
  });

  it('client/site no ven el proveedor', () => {
    expect(projectPriceStatusForRole(base, 'client').supplierName).toBeUndefined();
    expect(projectPriceStatusForRole(base, 'site').supplierName).toBeUndefined();
  });
});
