/**
 * domain.test.ts — Pruebas del dominio PURO de reconciliación
 * (APU_COMPONENT_RESOURCE_RECONCILIATION_V1). Cubre matching (8–16),
 * preservación de raw values, estados y CSV sanitizado (24).
 */
import { describe, expect, it } from 'vitest';
import { buildResourceMatchIndex } from '@/server/apu-import/matching';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import {
  buildReconciliationRow,
  isReconciliationTarget,
  parseDescriptionFromNotes,
  summarizeReconciliation,
  type RawReconciliationComponent,
} from '@/server/apu-reconciliation/domain';
import { buildReconciliationCsv } from '@/server/apu-reconciliation/csv';
import type { ReconciliationRow } from '@/lib/apu-reconciliation/types';

const RESOURCES: ResourceIdentifier[] = [
  { id: 'r-arena', code: 'ARENA-01', name: 'Arena lavada de río', unit: 'm3', externalSku: null, externalReference: null },
  { id: 'r-cem', code: 'CEM-GRIS', name: 'Cemento gris', unit: 'kg', externalSku: 'SKU-CEM-9', externalReference: 'REF-CEM-1' },
  { id: 'r-dup-a', code: 'DUP-A', name: 'Tubería pvc', unit: 'm', externalSku: null, externalReference: null },
  { id: 'r-dup-b', code: 'DUP-B', name: 'Tubería pvc', unit: 'kg', externalSku: null, externalReference: null },
];

const index = buildResourceMatchIndex(RESOURCES);
const resourceById = new Map(RESOURCES.map((r) => [r.id, r]));
const baseline = new Map<string, string>([['r-arena', '18500']]);

function comp(over: Partial<RawReconciliationComponent>): RawReconciliationComponent {
  return {
    componentId: 'c-1',
    apuTemplateId: 't-1',
    apuCode: 'A-100',
    apuName: 'Actividad demo',
    componentType: 'material',
    resourceId: null,
    laborRoleId: null,
    unitPriceSource: 'manual',
    reconciliationState: 'pending',
    rawCode: null,
    rawUnit: null,
    notes: null,
    quantity: '1',
    wastePct: '0',
    unitPriceSnapshot: '100',
    totalComponentCost: '100',
    importBatchId: null,
    ...over,
  };
}

describe('parseDescriptionFromNotes', () => {
  it('extrae la descripción embebida en notes', () => {
    expect(parseDescriptionFromNotes('Sin asociar al catálogo: "Arena lavada de río"', null)).toBe(
      'Arena lavada de río',
    );
  });
  it('cae a rawCode cuando no hay descripción embebida', () => {
    expect(parseDescriptionFromNotes('Cuadrilla: 2A+1O', 'X-9')).toBe('X-9');
    expect(parseDescriptionFromNotes(null, 'X-9')).toBe('X-9');
  });
});

describe('buildReconciliationRow — matching (8–16)', () => {
  it('8. code exacto ⇒ exact_match via code', () => {
    const row = buildReconciliationRow(comp({ rawCode: 'ARENA-01' }), index, baseline, resourceById);
    expect(row.state).toBe('exact_match');
    expect(row.primaryCandidate?.via).toBe('code');
    expect(row.primaryCandidate?.resourceId).toBe('r-arena');
  });

  it('9. referencia externa exacta ⇒ exact_match via reference', () => {
    const row = buildReconciliationRow(comp({ rawCode: 'REF-CEM-1' }), index, baseline, resourceById);
    expect(row.state).toBe('exact_match');
    expect(row.primaryCandidate?.via).toBe('reference');
  });

  it('10. SKU externo exacto ⇒ exact_match via sku', () => {
    const row = buildReconciliationRow(comp({ rawCode: 'SKU-CEM-9' }), index, baseline, resourceById);
    expect(row.state).toBe('exact_match');
    expect(row.primaryCandidate?.via).toBe('sku');
  });

  it('11. descripción ⇒ solo sugerencia (nunca exact), con unit mismatch', () => {
    const row = buildReconciliationRow(
      comp({ notes: 'Sin asociar al catálogo: "Arena lavada de río"', rawUnit: 'kg' }),
      index,
      baseline,
      resourceById,
    );
    expect(row.state).toBe('suggested');
    expect(row.primaryCandidate?.resourceId).toBe('r-arena');
    expect(row.primaryCandidate?.unitMismatch).toBe(true);
    expect(row.primaryCandidate?.approvedBaselinePrice).toBe('18500');
  });

  it('12. ambiguo (≥2 nombres normalizados sin desempate de unidad) no se auto-asocia', () => {
    const row = buildReconciliationRow(
      comp({ notes: 'Sin asociar al catálogo: "Tubería pvc"', rawUnit: 'und' }),
      index,
      baseline,
      resourceById,
    );
    expect(row.state).toBe('ambiguous');
    expect(row.candidates.length).toBe(2);
    expect(row.primaryCandidate).toBeNull();
  });

  it('13. sin coincidencia ⇒ unresolved (no inventa recurso)', () => {
    const row = buildReconciliationRow(
      comp({ notes: 'Sin asociar al catálogo: "Insumo inexistente xyz"' }),
      index,
      baseline,
      resourceById,
    );
    expect(row.state).toBe('unresolved');
    expect(row.primaryCandidate).toBeNull();
    expect(row.candidates).toEqual([]);
  });

  it('14. asociación existente preservada ⇒ associated', () => {
    const row = buildReconciliationRow(
      comp({ resourceId: 'r-arena', rawCode: 'ARENA-01' }),
      index,
      baseline,
      resourceById,
    );
    expect(row.state).toBe('associated');
    expect(row.associatedResourceId).toBe('r-arena');
    expect(row.associatedResourceCode).toBe('ARENA-01');
  });

  it('15. raw values preservados en la fila', () => {
    const row = buildReconciliationRow(
      comp({ rawCode: 'RAW-X', rawUnit: 'gl', notes: 'Sin asociar al catálogo: "Pintura"' }),
      index,
      baseline,
      resourceById,
    );
    expect(row.rawCode).toBe('RAW-X');
    expect(row.rawUnit).toBe('gl');
    expect(row.description).toBe('Pintura');
  });

  it('16. unidad equivalente ⇒ sugerencia sin unit mismatch', () => {
    const row = buildReconciliationRow(
      comp({ notes: 'Sin asociar al catálogo: "Arena lavada de río"', rawUnit: 'm3' }),
      index,
      baseline,
      resourceById,
    );
    expect(row.state).toBe('suggested');
    expect(row.primaryCandidate?.unitMismatch).toBe(false);
  });

  it('intentionally_unresolved gana sobre el matching dinámico', () => {
    const row = buildReconciliationRow(
      comp({ rawCode: 'ARENA-01', reconciliationState: 'intentionally_unresolved' }),
      index,
      baseline,
      resourceById,
    );
    expect(row.state).toBe('intentionally_unresolved');
  });
});

describe('isReconciliationTarget', () => {
  it('excluye mano de obra (labor_role_id o source labor_role)', () => {
    expect(isReconciliationTarget({ laborRoleId: 'l-1', unitPriceSource: 'resource' })).toBe(false);
    expect(isReconciliationTarget({ laborRoleId: null, unitPriceSource: 'labor_role' })).toBe(false);
    expect(isReconciliationTarget({ laborRoleId: null, unitPriceSource: 'manual' })).toBe(true);
  });
});

describe('summarizeReconciliation', () => {
  it('agrega los estados', () => {
    const rows = [
      buildReconciliationRow(comp({ componentId: 'a', rawCode: 'ARENA-01' }), index, baseline, resourceById),
      buildReconciliationRow(comp({ componentId: 'b', resourceId: 'r-arena' }), index, baseline, resourceById),
      buildReconciliationRow(comp({ componentId: 'c', notes: 'Sin asociar al catálogo: "nada"' }), index, baseline, resourceById),
    ];
    const s = summarizeReconciliation(rows);
    expect(s.totalComponents).toBe(3);
    expect(s.exactPending).toBe(1);
    expect(s.associated).toBe(1);
    expect(s.unresolved).toBe(1);
  });
});

describe('buildReconciliationCsv — sanitizado (24)', () => {
  it('neutraliza inyección de fórmulas y produce encabezados', () => {
    const row: ReconciliationRow = {
      ...buildReconciliationRow(comp({ apuName: '=SUM(A1)', rawCode: 'ARENA-01' }), index, baseline, resourceById),
    };
    const csv = buildReconciliationCsv([row]);
    expect(csv).toContain('APU');
    // El valor con '=' inicial debe quedar prefijado (no ejecutable).
    expect(csv).toMatch(/'?=SUM\(A1\)|"'=SUM/);
    expect(csv.startsWith('=')).toBe(false);
  });
});
