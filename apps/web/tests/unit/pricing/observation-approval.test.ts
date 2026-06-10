/**
 * Tests: workflow de aprobación/rechazo de observaciones (Fase 3A).
 * Usa FixtureObservationRepository para probar errores de negocio.
 */
import { describe, expect, it } from 'vitest';
import { FixtureObservationRepository, FixtureProviderRepository } from '@/server/pricing/fixture-repository';
import {
  PriceIntelligenceWriteNotSupportedError,
  ObservationNotFoundError,
  ObservationAlreadyReviewedError,
} from '@/server/pricing/errors';

import type { ViewerRole } from '@/lib/contracts/read-model';

const DEMO_VIEWER = {
  userId: '00000000-0000-0000-0000-0000000000b1',
  profileId: '00000000-0000-0000-0000-0000000000b1',
  organizationId: '00000000-0000-0000-0000-0000000000a1',
  role: 'management' as ViewerRole,
};

const DEMO_ORG_VIEWER = {
  ...DEMO_VIEWER,
  organizationId: '00000000-0000-0000-0000-0000000000a1',
};

describe('FixtureObservationRepository — listado', () => {
  it('lista observaciones del recurso demo', async () => {
    const repo = new FixtureObservationRepository();
    const obs = await repo.listResourcePriceObservations(
      DEMO_ORG_VIEWER,
      '00000000-0000-0000-0000-0000000000e1',
    );
    expect(obs.length).toBeGreaterThan(0);
  });

  it('devuelve lista vacía para recurso inexistente', async () => {
    const repo = new FixtureObservationRepository();
    const obs = await repo.listResourcePriceObservations(DEMO_ORG_VIEWER, 'unknown-resource');
    expect(obs).toHaveLength(0);
  });

  it('observación aprobada tiene isStale calculado', async () => {
    const repo = new FixtureObservationRepository();
    const obs = await repo.listResourcePriceObservations(
      DEMO_ORG_VIEWER,
      '00000000-0000-0000-0000-0000000000e1',
    );
    const approved = obs.find((o) => o.status === 'approved');
    expect(approved).toBeDefined();
    expect(typeof approved!.isStale).toBe('boolean');
  });
});

describe('FixtureObservationRepository — escritura bloqueada', () => {
  it('createResourcePriceObservation lanza WriteNotSupported', async () => {
    const repo = new FixtureObservationRepository();
    await expect(
      repo.createResourcePriceObservation(DEMO_ORG_VIEWER, {
        resourceId: '00000000-0000-0000-0000-0000000000e1',
        observedPrice: '28000',
        unit: 'saco',
        sourceType: 'manual',
        observedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(PriceIntelligenceWriteNotSupportedError);
  });

  it('approveResourcePriceObservation en obs ya aprobada lanza AlreadyReviewed', async () => {
    const repo = new FixtureObservationRepository();
    // obs 001 está approved
    await expect(
      repo.approveResourcePriceObservation(DEMO_ORG_VIEWER, {
        observationId: '00000000-0000-0000-0000-000000001001',
      }),
    ).rejects.toThrow(ObservationAlreadyReviewedError);
  });

  it('approveResourcePriceObservation en obs pendiente lanza WriteNotSupported', async () => {
    const repo = new FixtureObservationRepository();
    // obs 002 está pending
    await expect(
      repo.approveResourcePriceObservation(DEMO_ORG_VIEWER, {
        observationId: '00000000-0000-0000-0000-000000001002',
      }),
    ).rejects.toThrow(PriceIntelligenceWriteNotSupportedError);
  });

  it('approveResourcePriceObservation en obs inexistente lanza NotFound', async () => {
    const repo = new FixtureObservationRepository();
    await expect(
      repo.approveResourcePriceObservation(DEMO_ORG_VIEWER, {
        observationId: 'not-exist',
      }),
    ).rejects.toThrow(ObservationNotFoundError);
  });

  it('rejectResourcePriceObservation en obs ya aprobada lanza AlreadyReviewed', async () => {
    const repo = new FixtureObservationRepository();
    await expect(
      repo.rejectResourcePriceObservation(DEMO_ORG_VIEWER, {
        observationId: '00000000-0000-0000-0000-000000001001',
        rejectionReason: 'Precio incorrecto',
      }),
    ).rejects.toThrow(ObservationAlreadyReviewedError);
  });

  it('rejectResourcePriceObservation en obs inexistente lanza NotFound', async () => {
    const repo = new FixtureObservationRepository();
    await expect(
      repo.rejectResourcePriceObservation(DEMO_ORG_VIEWER, {
        observationId: 'not-exist',
        rejectionReason: 'Test',
      }),
    ).rejects.toThrow(ObservationNotFoundError);
  });
});

describe('FixtureObservationRepository — summary', () => {
  it('devuelve summary del recurso demo', async () => {
    const repo = new FixtureObservationRepository();
    const summary = await repo.getResourcePriceIntelligenceSummary(
      DEMO_ORG_VIEWER,
      '00000000-0000-0000-0000-0000000000e1',
    );
    expect(summary).not.toBeNull();
    expect(summary!.resourceCode).toBe('MAT-001');
    expect(summary!.approvedCount).toBeGreaterThan(0);
    expect(summary!.pendingCount).toBeGreaterThan(0);
  });

  it('devuelve null para recurso no demo', async () => {
    const repo = new FixtureObservationRepository();
    const summary = await repo.getResourcePriceIntelligenceSummary(DEMO_ORG_VIEWER, 'unknown');
    expect(summary).toBeNull();
  });
});

describe('FixtureProviderRepository', () => {
  it('lista proveedores de la org demo', async () => {
    const repo = new FixtureProviderRepository();
    const providers = await repo.listProviders(DEMO_ORG_VIEWER);
    expect(providers.length).toBeGreaterThan(0);
    expect(providers[0]!.name).toContain('Demo');
  });

  it('lista vacía para org desconocida', async () => {
    const repo = new FixtureProviderRepository();
    const providers = await repo.listProviders({ ...DEMO_ORG_VIEWER, organizationId: 'unknown' });
    expect(providers).toHaveLength(0);
  });

  it('getProviderById retorna proveedor demo', async () => {
    const repo = new FixtureProviderRepository();
    const p = await repo.getProviderById(DEMO_ORG_VIEWER, '00000000-0000-0000-0000-000000000101');
    expect(p.name).toContain('Homecenter');
  });

  it('getProviderById lanza NotFound para id inexistente', async () => {
    const repo = new FixtureProviderRepository();
    const { ProviderNotFoundError } = await import('@/server/pricing/errors');
    await expect(repo.getProviderById(DEMO_ORG_VIEWER, 'not-exist')).rejects.toThrow(ProviderNotFoundError);
  });

  it('createProvider lanza WriteNotSupported', async () => {
    const repo = new FixtureProviderRepository();
    await expect(repo.createProvider(DEMO_ORG_VIEWER, { name: 'Test' })).rejects.toThrow(PriceIntelligenceWriteNotSupportedError);
  });
});
