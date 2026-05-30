/**
 * estimates.test.ts — Inmutabilidad de versiones, snapshots y clonación.
 * Propiedad: agent-cost-domain.
 */
import { describe, it, expect } from 'vitest';
import {
  isVersionLocked,
  isVersionEditable,
  assertVersionEditable,
  ImmutableVersionError,
  createApuCalculationSnapshot,
  createEstimateTotalsSnapshot,
  cloneEstimateVersion,
  type EstimateVersionBundle,
} from '@/modules/estimates';
import type {
  ApuComponent,
  EstimateVersion,
  Chapter,
  BoqItem,
  IndirectCostRule,
  EstimateVersionStatus,
} from '@/lib/utils/types';
import { makeIdGen } from './_fakes';

describe('inmutabilidad de versiones', () => {
  it('approved/issued/archived están bloqueadas', () => {
    (['approved', 'issued', 'archived'] as EstimateVersionStatus[]).forEach((s) => {
      expect(isVersionLocked(s)).toBe(true);
      expect(isVersionEditable(s)).toBe(false);
    });
  });

  it('draft/review son editables', () => {
    (['draft', 'review'] as EstimateVersionStatus[]).forEach((s) => {
      expect(isVersionEditable(s)).toBe(true);
    });
  });

  it('assertVersionEditable lanza sobre versión emitida', () => {
    expect(() => assertVersionEditable('issued')).toThrow(ImmutableVersionError);
    expect(() => assertVersionEditable('draft')).not.toThrow();
  });
});

describe('snapshots inmutables', () => {
  const components: ApuComponent[] = [
    {
      id: 'a0', apuTemplateId: 'apu1', resourceId: 'r1', componentType: 'material',
      quantity: '1.05', wastePct: '0.08', unitPriceSource: 'manual',
      unitPriceSnapshot: '55000', totalComponentCost: '62370.00', sortOrder: 0, notes: null,
    },
    {
      id: 'a1', apuTemplateId: 'apu1', resourceId: 'r2', componentType: 'labor',
      quantity: '0.05', wastePct: '0', unitPriceSource: 'labor_role',
      unitPriceSnapshot: '120000', totalComponentCost: '6000', sortOrder: 1, notes: null,
    },
  ];

  it('deriva calculatedUnitCost de los componentes', () => {
    const snap = createApuCalculationSnapshot({
      id: 's1', apuTemplateId: 'apu1', estimateVersionId: 'v1',
      components, createdAt: '2026-05-29T00:00:00-05:00',
    });
    expect(snap.calculatedUnitCost).toBe('68370');
  });

  it('el snapshot es inmutable (congelado en memoria)', () => {
    const snap = createApuCalculationSnapshot({
      id: 's1', apuTemplateId: 'apu1', estimateVersionId: 'v1',
      components, createdAt: '2026-05-29T00:00:00-05:00',
    });
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.componentsJson)).toBe(true);
    expect(Object.isFrozen(snap.componentsJson[0])).toBe(true);
    expect(() => {
      // @ts-expect-error mutación prohibida en tiempo de compilación y ejecución
      snap.calculatedUnitCost = '0';
    }).toThrow();
  });

  it('snapshot de totales es inmutable', () => {
    const snap = createEstimateTotalsSnapshot({
      estimateVersionId: 'v1', directCosts: '100', totalIndirect: '10', totalCost: '110',
      builtArea: '10', valuePerSqm: '11', createdAt: '2026-05-29T00:00:00-05:00',
      indirectLines: [{ code: 'A', name: 'Admin', percentage: '0.035', base: '100', amount: '3.5', visibleToClient: true }],
    });
    expect(Object.isFrozen(snap)).toBe(true);
    expect(Object.isFrozen(snap.indirectLines[0])).toBe(true);
  });
});

describe('clonación de versiones', () => {
  const version: EstimateVersion = {
    id: 'v1', estimateId: 'e1', versionNumber: 1, status: 'approved',
    createdBy: null, createdAt: '2026-05-29T00:00:00-05:00',
    approvedAt: '2026-05-29T00:00:00-05:00', notes: 'original',
  };
  const chapters: Chapter[] = [{ id: 'ch1', estimateVersionId: 'v1', code: 'CAP-01', name: 'Preliminares', sortOrder: 0 }];
  const boqItems: BoqItem[] = [{
    id: 'b1', estimateVersionId: 'v1', chapterId: 'ch1', apuTemplateId: null, quantityGroupId: null,
    code: '1.1', descriptionSnapshot: 'Item', unitSnapshot: 'm2', quantitySnapshot: '10',
    unitPriceSnapshot: '100', subtotal: '1000', sortOrder: 0, notes: null,
  }];
  const indirectCostRules: IndirectCostRule[] = [{
    id: 'ir1', estimateVersionId: 'v1', code: 'A', name: 'Admin', percentage: '0.035',
    baseType: 'direct_cost', sortOrder: 0, visibleToClient: true,
  }];
  const source: EstimateVersionBundle = { version, chapters, boqItems, indirectCostRules };

  it('produce una versión draft con versionNumber+1 y nuevos IDs', () => {
    const clone = cloneEstimateVersion(source, { newId: makeIdGen(), now: () => '2026-06-01T00:00:00-05:00' });
    expect(clone.version.status).toBe('draft');
    expect(clone.version.versionNumber).toBe(2);
    expect(clone.version.approvedAt).toBeNull();
    expect(clone.version.id).not.toBe('v1');
    expect(clone.version.estimateId).toBe('e1');
  });

  it('reasocia los ítems al nuevo capítulo clonado', () => {
    const clone = cloneEstimateVersion(source, { newId: makeIdGen(), now: () => '2026-06-01T00:00:00-05:00' });
    expect(clone.boqItems[0]!.chapterId).toBe(clone.chapters[0]!.id);
    expect(clone.boqItems[0]!.estimateVersionId).toBe(clone.version.id);
  });

  it('el clon es INDEPENDIENTE: mutar el clon no afecta el original', () => {
    const clone = cloneEstimateVersion(source, { newId: makeIdGen(), now: () => '2026-06-01T00:00:00-05:00' });
    clone.boqItems[0]!.unitPriceSnapshot = '999';
    expect(source.boqItems[0]!.unitPriceSnapshot).toBe('100');
    expect(clone.chapters[0]!.id).not.toBe('ch1');
    expect(clone.indirectCostRules[0]!.id).not.toBe('ir1');
  });

  it('clonar una versión approved no muta el original (no recálculo retroactivo)', () => {
    const snap = JSON.stringify(source);
    cloneEstimateVersion(source, { newId: makeIdGen(), now: () => '2026-06-01T00:00:00-05:00' });
    expect(JSON.stringify(source)).toBe(snap);
  });
});
