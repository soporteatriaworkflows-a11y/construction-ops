/**
 * port-reconciliation.test.ts — Reconciliación de Oleada 2B (integración).
 * Propiedad: agent-homecenter (ownership de pricing-adapters).
 *
 * Demuestra que el adaptador consume el `PricingApprovalPort` REAL (no una
 * lógica de aprobación paralela):
 *   1. Type-level: `PricingApprovalPort`/`PricingApprovalService` satisface el
 *      `MinimalApprovalPort` que usa el adaptador (subconjunto estructural).
 *   2. Runtime: `applyApprovedProposals` persiste a través del
 *      `PricingApprovalService` real (con repositorio in-memory), respetando
 *      append-only e idempotencia.
 */
import { describe, it, expect } from 'vitest';
import type { PricingApprovalPort } from '@/modules/pricing/types';
import { PricingApprovalService } from '@/modules/pricing/approval-service';
import { InMemoryPricingRepository } from '@/modules/pricing/in-memory-repository';
import {
  applyApprovedProposals,
  type MinimalApprovalPort,
} from '@/modules/pricing/adapters/supplier-adapter';
import type { SkuMatchProposal } from '@/modules/pricing/adapters/types';

// (1) Aserción de compatibilidad en tiempo de compilación: el puerto canónico de
//     pricing es asignable al puerto mínimo del adaptador. Si esto compila, el
//     adaptador puede recibir el `PricingApprovalService` real sin envoltura.
const _realPortSatisfiesMinimal: (p: PricingApprovalPort) => MinimalApprovalPort = (p) => p;

const TS = '2026-05-30T00:00:00.000Z';
const ORG = '00000000-0000-4000-8000-0000000000aa';
const SUPPLIER = '00000000-0000-4000-8000-0000000000bb';
const PRODUCT = '00000000-0000-4000-8000-0000000000cc';
const RESOURCE = '00000000-0000-4000-8000-0000000000dd';
const APPROVER = '00000000-0000-4000-8000-0000000000ee';

function makeRepo(): InMemoryPricingRepository {
  return new InMemoryPricingRepository(
    {
      supplierProducts: [
        {
          id: PRODUCT,
          supplierId: SUPPLIER,
          resourceId: RESOURCE,
          supplierSku: 'CEM-001',
          supplierProductName: 'Cemento gris 50kg',
          productUrl: null,
          locationReference: null,
          currency: 'COP',
          active: true,
          manualOverride: false,
          lastCheckedAt: null,
          syncStatus: 'manual',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    },
    () => TS,
  );
}

function approvedProposal(): SkuMatchProposal {
  const candidate = { resourceId: RESOURCE, supplierProductId: PRODUCT, score: 0.92, reason: 'sku exacto' };
  return {
    rawItem: {
      name: 'Cemento gris 50kg',
      onlinePublicPrice: '28000',
      currency: 'COP',
      observedAt: TS,
      rawRowIndex: 0,
      sku: 'CEM-001',
    },
    candidates: [candidate],
    chosen: candidate,
    status: 'approved',
    requiresManualReview: false,
  };
}

describe('Reconciliación 2B: el adaptador consume el PricingApprovalPort real', () => {
  it('PricingApprovalService satisface MinimalApprovalPort (type-level)', () => {
    expect(typeof _realPortSatisfiesMinimal).toBe('function');
  });

  it('applyApprovedProposals persiste vía el PricingApprovalService real', async () => {
    const repo = makeRepo();
    const service = new PricingApprovalService(repo, { organizationId: ORG });
    const keys = new Set<string>();

    const audit = await applyApprovedProposals(
      [approvedProposal()],
      service,
      APPROVER,
      TS,
      'sample-catalog.csv',
      keys,
    );

    expect(audit.errors).toEqual([]);
    expect(audit.observationIds).toHaveLength(1);
    expect(audit.approvedBy).toBe(APPROVER);

    // La observación quedó persistida A TRAVÉS del puerto real (no escritura
    // directa del adaptador) y aprobada.
    const obs = await repo.listObservations(PRODUCT);
    expect(obs.length).toBeGreaterThanOrEqual(1);
    expect(obs.some((o) => o.approved)).toBe(true);
  });

  it('idempotencia: reusar la clave no duplica la observación', async () => {
    const repo = makeRepo();
    const service = new PricingApprovalService(repo, { organizationId: ORG });
    const keys = new Set<string>();

    await applyApprovedProposals([approvedProposal()], service, APPROVER, TS, 'sample-catalog.csv', keys);
    const again = await applyApprovedProposals([approvedProposal()], service, APPROVER, TS, 'sample-catalog.csv', keys);

    expect(again.duplicates).toBe(1);
    expect(again.observationIds).toHaveLength(0);
  });
});
