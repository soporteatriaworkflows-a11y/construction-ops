/**
 * Tests unitarios — integridad de mocks vs interfaces API_CONTRACTS.
 * Verifica que los mocks respetan EXACTAMENTE las interfaces congeladas.
 * Propiedad: agent-frontend-boq.
 */
import { describe, it, expect } from 'vitest';
import {
  MOCK_ORGANIZATION,
  MOCK_PROFILE,
  MOCK_PROJECTS,
  MOCK_SCOPES,
  MOCK_RESOURCES,
  MOCK_APU_TEMPLATES,
  MOCK_APU_COMPONENTS,
  MOCK_ESTIMATE,
  MOCK_ESTIMATE_VERSIONS,
  MOCK_CHAPTERS,
  MOCK_BOQ_ITEMS,
  MOCK_INDIRECT_COST_RULES,
  MOCK_QUANTITY_GROUPS,
  MOCK_QUANTITY_LINES,
  getBoqItemsByChapter,
  getScopesByProject,
  getComponentsByApu,
} from '@/lib/utils/mocks';

// ---------------------------------------------------------------------------
// Helpers de validación de estructura
// ---------------------------------------------------------------------------

function isDecimalString(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return !isNaN(parseFloat(v));
}

function isIsoDate(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isIsoDateTime(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  // Acepta ISO con zona horaria
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v);
}

function isUuid(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  // UUID canónico o pseudo-UUID con guiones (mock)
  return v.length > 8;
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------
describe('MOCK_ORGANIZATION — estructura', () => {
  it('tiene id, name, createdAt, updatedAt', () => {
    expect(isUuid(MOCK_ORGANIZATION.id)).toBe(true);
    expect(typeof MOCK_ORGANIZATION.name).toBe('string');
    expect(isIsoDateTime(MOCK_ORGANIZATION.createdAt)).toBe(true);
    expect(isIsoDateTime(MOCK_ORGANIZATION.updatedAt)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Profile — campos 🔒 presentes pero no expuestos al cliente
// ---------------------------------------------------------------------------
describe('MOCK_PROFILE — estructura', () => {
  it('tiene campos requeridos incluyendo los internos', () => {
    expect(isUuid(MOCK_PROFILE.id)).toBe(true);
    expect(isUuid(MOCK_PROFILE.organizationId)).toBe(true);
    expect(typeof MOCK_PROFILE.fullName).toBe('string');
    expect(typeof MOCK_PROFILE.email).toBe('string'); // 🔒
    expect(typeof MOCK_PROFILE.role).toBe('string');  // 🔒
  });
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
describe('MOCK_PROJECTS — estructura', () => {
  it('tiene al menos un proyecto', () => {
    expect(MOCK_PROJECTS.length).toBeGreaterThan(0);
  });

  it('cada proyecto tiene los campos requeridos del contrato', () => {
    for (const p of MOCK_PROJECTS) {
      expect(isUuid(p.id)).toBe(true);
      expect(isUuid(p.organizationId)).toBe(true);
      expect(typeof p.code).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(['active', 'archived', 'closed']).toContain(p.status);
      expect(isIsoDateTime(p.createdAt)).toBe(true);
      expect(isIsoDateTime(p.updatedAt)).toBe(true);
      // startDate y estimatedEndDate son opcionales pero si están deben ser IsoDate
      if (p.startDate) expect(isIsoDate(p.startDate)).toBe(true);
      if (p.estimatedEndDate) expect(isIsoDate(p.estimatedEndDate)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ProjectScopes
// ---------------------------------------------------------------------------
describe('MOCK_SCOPES — estructura', () => {
  it('cada scope tiene los campos del contrato', () => {
    for (const s of MOCK_SCOPES) {
      expect(isUuid(s.id)).toBe(true);
      expect(isUuid(s.projectId)).toBe(true);
      expect(typeof s.code).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(['active', 'archived']).toContain(s.status);
    }
  });
});

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------
describe('MOCK_RESOURCES — estructura', () => {
  it('cada recurso tiene los campos del contrato', () => {
    const validTypes = ['material', 'labor', 'equipment', 'tool', 'subcontract', 'other'];
    for (const r of MOCK_RESOURCES) {
      expect(isUuid(r.id)).toBe(true);
      expect(typeof r.code).toBe('string');
      expect(typeof r.name).toBe('string');
      expect(validTypes).toContain(r.resourceType);
      expect(typeof r.unit).toBe('string');
      expect(isDecimalString(r.defaultWastePct)).toBe(true);
      expect(typeof r.active).toBe('boolean');
    }
  });
});

// ---------------------------------------------------------------------------
// APU Templates + Components
// ---------------------------------------------------------------------------
describe('MOCK_APU_TEMPLATES — estructura', () => {
  it('cada template tiene los campos del contrato', () => {
    for (const t of MOCK_APU_TEMPLATES) {
      expect(isUuid(t.id)).toBe(true);
      expect(typeof t.code).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.unit).toBe('string');
      expect(typeof t.version).toBe('number');
      expect(t.version).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('MOCK_APU_COMPONENTS — estructura', () => {
  it('cada componente tiene los campos del contrato', () => {
    const validTypes = ['material', 'labor', 'equipment', 'tool', 'subcontract', 'other'];
    for (const c of MOCK_APU_COMPONENTS) {
      expect(isUuid(c.id)).toBe(true);
      expect(isUuid(c.apuTemplateId)).toBe(true);
      expect(validTypes).toContain(c.componentType);
      expect(isDecimalString(c.quantity)).toBe(true);
      expect(isDecimalString(c.wastePct)).toBe(true);
      expect(isDecimalString(c.unitPriceSnapshot)).toBe(true);
      expect(isDecimalString(c.totalComponentCost)).toBe(true);
      expect(typeof c.sortOrder).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// BOQ Items — campos cliente-safe
// ---------------------------------------------------------------------------
describe('MOCK_BOQ_ITEMS — estructura', () => {
  it('cada item tiene los campos cliente-safe del contrato', () => {
    for (const item of MOCK_BOQ_ITEMS) {
      expect(isUuid(item.id)).toBe(true);
      expect(typeof item.code).toBe('string');
      expect(typeof item.descriptionSnapshot).toBe('string');
      expect(typeof item.unitSnapshot).toBe('string');
      expect(isDecimalString(item.quantitySnapshot)).toBe(true);
      expect(isDecimalString(item.unitPriceSnapshot)).toBe(true);
      expect(isDecimalString(item.subtotal)).toBe(true);
      expect(typeof item.sortOrder).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// IndirectCostRules — privacidad
// ---------------------------------------------------------------------------
describe('MOCK_INDIRECT_COST_RULES — estructura', () => {
  it('tiene campos requeridos', () => {
    for (const r of MOCK_INDIRECT_COST_RULES) {
      expect(isUuid(r.id)).toBe(true);
      expect(typeof r.code).toBe('string');
      expect(typeof r.name).toBe('string');
      expect(isDecimalString(r.percentage)).toBe(true);
      expect(typeof r.visibleToClient).toBe('boolean');
    }
  });

  it('hay reglas visibles al cliente', () => {
    const visible = MOCK_INDIRECT_COST_RULES.filter((r) => r.visibleToClient);
    expect(visible.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// QuantityGroups + Lines
// ---------------------------------------------------------------------------
describe('MOCK_QUANTITY_GROUPS — estructura', () => {
  it('tiene los campos requeridos del contrato', () => {
    const validModes = ['direct', 'length', 'area', 'volume', 'custom'];
    for (const g of MOCK_QUANTITY_GROUPS) {
      expect(isUuid(g.id)).toBe(true);
      expect(typeof g.code).toBe('string');
      expect(typeof g.unit).toBe('string');
      expect(validModes).toContain(g.calculationMode);
    }
  });
});

describe('MOCK_QUANTITY_LINES — estructura', () => {
  it('tiene los campos requeridos del contrato', () => {
    const validFormulas = ['direct', 'length', 'area', 'volume', 'custom'];
    for (const l of MOCK_QUANTITY_LINES) {
      expect(isUuid(l.id)).toBe(true);
      expect(isUuid(l.quantityGroupId)).toBe(true);
      expect(isDecimalString(l.multiplier)).toBe(true);
      expect(validFormulas).toContain(l.formulaType);
      expect(isDecimalString(l.calculatedQuantity)).toBe(true);
      expect(typeof l.sortOrder).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
describe('getBoqItemsByChapter', () => {
  it('filtra correctamente por chapterId', () => {
    const chapterId = 'chp-0001-0000-0000-000000000001';
    const result = getBoqItemsByChapter(MOCK_BOQ_ITEMS, chapterId);
    expect(result.every((i) => i.chapterId === chapterId)).toBe(true);
  });

  it('devuelve array vacío si no hay items para el capítulo', () => {
    const result = getBoqItemsByChapter(MOCK_BOQ_ITEMS, 'non-existent-id');
    expect(result).toHaveLength(0);
  });
});

describe('getScopesByProject', () => {
  it('filtra correctamente por projectId', () => {
    const projectId = 'prj-0001-0000-0000-000000000001';
    const result = getScopesByProject(MOCK_SCOPES, projectId);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => s.projectId === projectId)).toBe(true);
  });
});

describe('getComponentsByApu', () => {
  it('filtra correctamente por apuTemplateId', () => {
    const apuId = 'apu-0001-0000-0000-000000000001';
    const result = getComponentsByApu(MOCK_APU_COMPONENTS, apuId);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((c) => c.apuTemplateId === apuId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regla de privacidad: NO hay lógica de descuento en mocks de cliente
// ---------------------------------------------------------------------------
describe('Privacidad — mocks', () => {
  it('no hay campos negotiated_discount en los items BOQ', () => {
    for (const item of MOCK_BOQ_ITEMS) {
      // Los keys del objeto no deben contener "discount" o "saving"
      const keys = Object.keys(item);
      expect(keys.some((k) => k.toLowerCase().includes('discount'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('saving'))).toBe(false);
    }
  });
});
