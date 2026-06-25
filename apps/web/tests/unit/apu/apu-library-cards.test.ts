/**
 * apu-library-cards.test.ts — Helpers PUROS de la vista Tarjetas de la Biblioteca
 * APU (APU_LIBRARY_REUSABLE_ACTIVITIES_UX_V1). Sin DB, sin cálculo financiero.
 */
import { describe, it, expect } from 'vitest';
import { deriveApuCategory } from '@/lib/apu-library/category';
import {
  computeApuCompleteness,
  editableCapabilities,
} from '@/lib/apu-library/completeness';
import { summarizeApuComponents } from '@/server/read-model/compute';
import type { ApuLibraryItem } from '@/lib/apu-library/types';

function item(over: Partial<ApuLibraryItem> = {}): ApuLibraryItem {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    code: 'A1',
    name: 'Pañete muro',
    unit: 'm2',
    componentCount: 3,
    unitCost: '25000',
    boqLinked: true,
    origin: 'Manual',
    importBatchId: null,
    resourceStatus: { total: 2, associated: 2, pending: 0, suggested: 0, unresolved: 0, ambiguous: 0, intentionallyUnresolved: 0 },
    archivedAt: null,
    typeCounts: { material: 2, labor: 1, equipment: 0, tool: 0, subcontract: 0, other: 0 },
    materialsWithoutPrice: 0,
    category: 'Acabados',
    ...over,
  };
}

describe('computeApuCompleteness — estados', () => {
  it('ready: todo correcto', () => {
    expect(computeApuCompleteness(item()).state).toBe('ready');
  });
  it('review: solo warning (sin categoría)', () => {
    const c = computeApuCompleteness(item({ category: 'Sin categoría' }));
    expect(c.state).toBe('review');
    expect(c.issues.some((i) => i.severity === 'critical')).toBe(false);
  });
  it('incomplete: hay critical', () => {
    expect(computeApuCompleteness(item({ componentCount: 0 })).state).toBe('incomplete');
  });
  it('archived: archivedAt presente', () => {
    expect(computeApuCompleteness(item({ archivedAt: '2026-01-01T00:00:00Z' })).state).toBe('archived');
  });
});

describe('computeApuCompleteness — issues por severidad', () => {
  it('material sin precio → critical', () => {
    const c = computeApuCompleteness(item({ materialsWithoutPrice: 2 }));
    expect(c.state).toBe('incomplete');
    expect(c.issues.find((i) => i.code === 'materials_without_price')?.severity).toBe('critical');
  });
  it('sin componentes → critical', () => {
    const c = computeApuCompleteness(item({ componentCount: 0 }));
    expect(c.issues.find((i) => i.code === 'no_components')?.severity).toBe('critical');
  });
  it('precio unitario 0 → critical', () => {
    expect(computeApuCompleteness(item({ unitCost: '0' })).issues.find((i) => i.code === 'zero_unit_cost')?.severity).toBe('critical');
  });
  it('labor heredado (sin override) NO es critical', () => {
    // APU con M.O. y material con precio, categorizado, vinculado → sin critical.
    const c = computeApuCompleteness(item({ typeCounts: { material: 1, labor: 2, equipment: 0, tool: 0, subcontract: 0, other: 0 } }));
    expect(c.state).toBe('ready');
    expect(c.issues.some((i) => i.severity === 'critical')).toBe(false);
  });
  it('sin vínculo BOQ → info, no degrada a incomplete', () => {
    const c = computeApuCompleteness(item({ boqLinked: false }));
    expect(c.issues.find((i) => i.code === 'no_boq_link')?.severity).toBe('info');
    expect(c.state).toBe('ready');
  });
});

describe('editableCapabilities', () => {
  it('material ⇒ consumo + desperdicio; labor ⇒ rendimiento', () => {
    const caps = editableCapabilities(item());
    expect(caps).toContain('Consumo editable');
    expect(caps).toContain('Desperdicio editable');
    expect(caps).toContain('Rendimiento editable');
  });
  it('sin labor ⇒ sin "Rendimiento editable"', () => {
    const caps = editableCapabilities(item({ typeCounts: { material: 1, labor: 0, equipment: 0, tool: 0, subcontract: 0, other: 0 } }));
    expect(caps).not.toContain('Rendimiento editable');
  });
});

describe('deriveApuCategory — fallback por palabras clave', () => {
  it('clasifica por keyword', () => {
    expect(deriveApuCategory('Estuco y pintura sobre muro')).toBe('Pintura');
    expect(deriveApuCategory('Microcemento en piso')).toBe('Microcemento');
    expect(deriveApuCategory('Enchape cerámico baño')).toBe('Enchapes');
    expect(deriveApuCategory('Excavación manual')).toBe('Civil');
  });
  it('sin match → Sin categoría', () => {
    expect(deriveApuCategory('Actividad genérica xyz')).toBe('Sin categoría');
    expect(deriveApuCategory('')).toBe('Sin categoría');
  });
});

describe('summarizeApuComponents — conteos (no recalcula finanzas)', () => {
  it('cuenta por tipo y materiales sin precio', () => {
    const r = summarizeApuComponents([
      { componentType: 'material', unitPriceSnapshot: '1000' },
      { componentType: 'material', unitPriceSnapshot: '0' },
      { componentType: 'labor', unitPriceSnapshot: '50000' },
    ]);
    expect(r.typeCounts.material).toBe(2);
    expect(r.typeCounts.labor).toBe(1);
    expect(r.materialsWithoutPrice).toBe(1);
  });
  it('material sin precio cuenta inválidos/≤0', () => {
    const r = summarizeApuComponents([
      { componentType: 'material', unitPriceSnapshot: 'x' },
      { componentType: 'material', unitPriceSnapshot: '-5' },
    ]);
    expect(r.materialsWithoutPrice).toBe(2);
  });
});
