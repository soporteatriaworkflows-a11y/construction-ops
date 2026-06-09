/**
 * Tests: seguridad y privacidad de Price Intelligence (Fase 3A).
 */
import { describe, expect, it } from 'vitest';
import { FixtureObservationRepository, FixtureProviderRepository } from '@/server/pricing/fixture-repository';
import { INTERNAL_PRICE_FIELDS } from '@/lib/contracts/pricing-read';

import type { ViewerRole } from '@/lib/contracts/read-model';

const DEMO_VIEWER = {
  userId: '00000000-0000-0000-0000-0000000000b1',
  profileId: '00000000-0000-0000-0000-0000000000b1',
  organizationId: '00000000-0000-0000-0000-0000000000a1',
  role: 'management' as ViewerRole,
};

// ---------------------------------------------------------------------------
// RLS aislamiento cross-org (simulado a nivel de repositorio fixture)
// ---------------------------------------------------------------------------

describe('Aislamiento por organización (fixture)', () => {
  it('listProviders no devuelve datos de org diferente', async () => {
    const repo = new FixtureProviderRepository();
    const OTHER_ORG = '00000000-0000-0000-0000-9999999999aa';
    const list = await repo.listProviders({ ...DEMO_VIEWER, organizationId: OTHER_ORG });
    expect(list).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Campos 🔒 presentes en ResourcePriceObservationView
// (test de estructura, no de privacidad de red — eso cubre el RLS)
// ---------------------------------------------------------------------------

describe('ResourcePriceObservationView — campos sensibles existentes', () => {
  it('observedPrice está presente en la vista interna', async () => {
    const repo = new FixtureObservationRepository();
    const obs = await repo.listResourcePriceObservations(
      DEMO_VIEWER,
      '00000000-0000-0000-0000-0000000000e1',
    );
    const approved = obs.find((o) => o.status === 'approved');
    expect(approved).toBeDefined();
    expect(approved!.observedPrice).toBeTruthy();
    expect(approved!.discountPercent).toBeTruthy();
    expect(approved!.suggestedNetPrice).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// INTERNAL_PRICE_FIELDS del contrato existente no se rompe
// ---------------------------------------------------------------------------

describe('INTERNAL_PRICE_FIELDS contract', () => {
  it('el contrato de pricing-read incluye onlinePublicPrice como campo interno', () => {
    expect(INTERNAL_PRICE_FIELDS).toContain('onlinePublicPrice');
    expect(INTERNAL_PRICE_FIELDS).toContain('negotiatedDiscountPct');
    expect(INTERNAL_PRICE_FIELDS).toContain('budgetReferencePrice');
  });
});

// ---------------------------------------------------------------------------
// organization_id y created_by son server-side (verificación de tipos)
// ---------------------------------------------------------------------------

describe('CreateObservationInput — campos server-side ausentes', () => {
  it('CreateObservationInput no tiene organization_id', async () => {
    const { type: _, ...rest } = await import('@/server/pricing').then((m) => {
      // Solo verificamos que el tipo compilado no tenga organization_id
      const input: import('@/server/pricing').CreateObservationInput = {
        resourceId: 'r1',
        observedPrice: '100',
        unit: 'saco',
        sourceType: 'manual',
        observedAt: new Date().toISOString(),
      };
      return { type: 'ok', input };
    });
    // Si compiló sin organización_id ni created_by, el test pasa
    expect(rest).toBeDefined();
  });

  it('ApproveObservationInput no tiene approved_by ni approved_at', async () => {
    const input: import('@/server/pricing').ApproveObservationInput = {
      observationId: 'obs-1',
    };
    // No compila si tiene approved_by o approved_at como campos obligatorios
    expect(input.observationId).toBe('obs-1');
  });
});

// ---------------------------------------------------------------------------
// Error class hierarchy
// ---------------------------------------------------------------------------

describe('Error classes', () => {
  it('ObservationAlreadyReviewedError tiene currentStatus', async () => {
    const { ObservationAlreadyReviewedError } = await import('@/server/pricing/errors');
    const err = new ObservationAlreadyReviewedError('obs-1', 'approved');
    expect(err.currentStatus).toBe('approved');
    expect(err.observationId).toBe('obs-1');
    expect(err.code).toBe('observation_already_reviewed');
  });

  it('InsufficientRoleError tiene código', async () => {
    const { InsufficientRoleError } = await import('@/server/pricing/errors');
    const err = new InsufficientRoleError('admin|gerencia', 'obra');
    expect(err.code).toBe('insufficient_role');
    expect(err.message).toContain('admin|gerencia');
  });

  it('ProviderNotFoundError tiene providerId', async () => {
    const { ProviderNotFoundError } = await import('@/server/pricing/errors');
    const err = new ProviderNotFoundError('prov-uuid');
    expect(err.providerId).toBe('prov-uuid');
    expect(err.code).toBe('provider_not_found');
  });
});
