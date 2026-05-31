/**
 * Tests unitarios — lib/contracts/read-model.ts + components/budget/dev-read-model.ts
 *
 * Verifica que el accesor temporal de desarrollo devuelve DTOs conformes al
 * contrato READ_MODEL v1 y que no expone campos internos (🔒).
 *
 * Propiedad: agent-frontend-boq.
 */
import { describe, it, expect } from 'vitest';
import { getReadModel } from '@/components/budget/dev-read-model';

// ---------------------------------------------------------------------------
// Helpers de validación de DTOs
// ---------------------------------------------------------------------------

function isDecimalString(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return !isNaN(parseFloat(v)) && v.trim() !== '';
}

function isUuid(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return v.length >= 8;
}

function isIsoDateTime(v: unknown): boolean {
  if (typeof v !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}T/.test(v);
}

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

describe('ReadModel.listProjects', () => {
  it('devuelve al menos un proyecto', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    expect(projects.length).toBeGreaterThan(0);
  });

  it('cada proyecto tiene id, code, name, status', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    for (const p of projects) {
      expect(isUuid(p.id)).toBe(true);
      expect(typeof p.code).toBe('string');
      expect(p.code.length).toBeGreaterThan(0);
      expect(typeof p.name).toBe('string');
      expect(p.name.length).toBeGreaterThan(0);
      expect(['active', 'archived', 'closed']).toContain(p.status);
    }
  });

  it('cada proyecto tiene scopeNames (array de strings)', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    for (const p of projects) {
      expect(Array.isArray(p.scopeNames)).toBe(true);
      for (const name of p.scopeNames) {
        expect(typeof name).toBe('string');
      }
    }
  });

  it('no expone clientReference (campo interno 🔒)', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    for (const p of projects) {
      const keys = Object.keys(p);
      expect(keys.includes('clientReference')).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// getProjectOverview
// ---------------------------------------------------------------------------

describe('ReadModel.getProjectOverview', () => {
  it('devuelve null para un id inexistente', async () => {
    const rm = getReadModel();
    const result = await rm.getProjectOverview('non-existent-id-123');
    expect(result).toBeNull();
  });

  it('devuelve el proyecto con sus alcances', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const first = projects[0]!;
    const overview = await rm.getProjectOverview(first.id);

    expect(overview).not.toBeNull();
    expect(overview!.id).toBe(first.id);
    expect(overview!.code).toBe(first.code);
    expect(overview!.name).toBe(first.name);
    expect(Array.isArray(overview!.scopes)).toBe(true);
    expect(overview!.scopes.length).toBeGreaterThan(0);
  });

  it('cada scope tiene id, code, name, scopeType', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);

    for (const scope of overview!.scopes) {
      expect(isUuid(scope.id)).toBe(true);
      expect(typeof scope.code).toBe('string');
      expect(typeof scope.name).toBe('string');
      expect(typeof scope.scopeType).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// listEstimates
// ---------------------------------------------------------------------------

describe('ReadModel.listEstimates', () => {
  it('devuelve estimados para el scope del fixture', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const floorScope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;

    const estimates = await rm.listEstimates(floorScope.id);
    expect(estimates.length).toBeGreaterThan(0);
  });

  it('cada EstimateSummary tiene los campos financieros como DecimalString', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const estimates = await rm.listEstimates(scope.id);

    for (const est of estimates) {
      expect(isUuid(est.id)).toBe(true);
      expect(typeof est.versionNumber).toBe('number');
      expect(isDecimalString(est.directCost)).toBe(true);
      expect(isDecimalString(est.administration)).toBe(true);
      expect(isDecimalString(est.contingency)).toBe(true);
      expect(isDecimalString(est.utility)).toBe(true);
      expect(isDecimalString(est.taxOnUtility)).toBe(true);
      expect(isDecimalString(est.grandTotal)).toBe(true);
    }
  });

  it('los totales del golden master son correctos (±0.01 COP)', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const estimates = await rm.listEstimates(scope.id);
    const est = estimates[0]!;

    // Valores del golden master (docs/PROJECT_MASTER.md §3.4)
    expect(parseFloat(est.directCost)).toBeCloseTo(336084479.93690735, 1);
    expect(parseFloat(est.administration)).toBeCloseTo(11762956.797791759, 1);
    expect(parseFloat(est.contingency)).toBeCloseTo(8402111.998422684, 1);
    expect(parseFloat(est.utility)).toBeCloseTo(13443379.197476294, 1);
    expect(parseFloat(est.taxOnUtility)).toBeCloseTo(2554242.047520496, 1);
    expect(parseFloat(est.grandTotal)).toBeCloseTo(372247169.9781186, 1);
  });

  it('devuelve array vacío para scopeId inexistente', async () => {
    const rm = getReadModel();
    const result = await rm.listEstimates('scope-that-does-not-exist');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getEstimateDetail
// ---------------------------------------------------------------------------

describe('ReadModel.getEstimateDetail', () => {
  it('devuelve null para una versión inexistente', async () => {
    const rm = getReadModel();
    const result = await rm.getEstimateDetail('ver-non-existent');
    expect(result).toBeNull();
  });

  it('devuelve capítulos e ítems para la versión del fixture', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const estimates = await rm.listEstimates(scope.id);
    const versionId = estimates[0]!.id;

    const detail = await rm.getEstimateDetail(versionId);
    expect(detail).not.toBeNull();
    expect(Array.isArray(detail!.chapters)).toBe(true);
    expect(Array.isArray(detail!.items)).toBe(true);
    expect(detail!.chapters.length).toBeGreaterThan(0);
    expect(detail!.items.length).toBeGreaterThan(0);
  });

  it('hay 14 capítulos y 131 ítems BOQ (golden master)', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const estimates = await rm.listEstimates(scope.id);
    const detail = await rm.getEstimateDetail(estimates[0]!.id);

    expect(detail!.chapters).toHaveLength(14);
    expect(detail!.items).toHaveLength(131);
  });

  it('cada BoqItemView tiene campos cliente-safe como DecimalString', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const estimates = await rm.listEstimates(scope.id);
    const detail = await rm.getEstimateDetail(estimates[0]!.id);

    for (const item of detail!.items) {
      expect(isUuid(item.id)).toBe(true);
      expect(typeof item.description).toBe('string');
      expect(typeof item.unit).toBe('string');
      expect(isDecimalString(item.quantity)).toBe(true);
      expect(isDecimalString(item.unitPrice)).toBe(true);
      expect(isDecimalString(item.subtotal)).toBe(true);
    }
  });

  it('los ítems no exponen negotiated_discount ni campos 🔒', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const estimates = await rm.listEstimates(scope.id);
    const detail = await rm.getEstimateDetail(estimates[0]!.id);

    for (const item of detail!.items) {
      const keys = Object.keys(item);
      expect(keys.some((k) => k.toLowerCase().includes('discount'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('saving'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('negotiated'))).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// listApus
// ---------------------------------------------------------------------------

describe('ReadModel.listApus', () => {
  it('devuelve al menos un APU', async () => {
    const rm = getReadModel();
    const apus = await rm.listApus();
    expect(apus.length).toBeGreaterThan(0);
  });

  it('cada ApuSummary tiene id, code, name, unit, unitCost, componentCount', async () => {
    const rm = getReadModel();
    const apus = await rm.listApus();
    for (const apu of apus) {
      expect(isUuid(apu.id)).toBe(true);
      expect(typeof apu.code).toBe('string');
      expect(typeof apu.name).toBe('string');
      expect(typeof apu.unit).toBe('string');
      expect(isDecimalString(apu.unitCost)).toBe(true);
      expect(typeof apu.componentCount).toBe('number');
      expect(apu.componentCount).toBeGreaterThanOrEqual(0);
    }
  });

  it('unitCost es positivo para APUs con componentes', async () => {
    const rm = getReadModel();
    const apus = await rm.listApus();
    const withComponents = apus.filter((a) => a.componentCount > 0);
    for (const apu of withComponents) {
      expect(parseFloat(apu.unitCost)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// listQuantities
// ---------------------------------------------------------------------------

describe('ReadModel.listQuantities', () => {
  it('devuelve grupos de cantidades para el scope del fixture', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const groups = await rm.listQuantities(scope.id);
    expect(groups.length).toBeGreaterThan(0);
  });

  it('cada QuantityGroupView tiene id, name, unit, calculationMode, lines', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const groups = await rm.listQuantities(scope.id);

    for (const group of groups) {
      expect(isUuid(group.id)).toBe(true);
      expect(typeof group.name).toBe('string');
      expect(typeof group.unit).toBe('string');
      expect(typeof group.calculationMode).toBe('string');
      expect(Array.isArray(group.lines)).toBe(true);
    }
  });

  it('cada línea tiene id, calculatedQuantity (DecimalString)', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const groups = await rm.listQuantities(scope.id);

    for (const group of groups) {
      for (const line of group.lines) {
        expect(isUuid(line.id)).toBe(true);
        expect(isDecimalString(line.calculatedQuantity)).toBe(true);
      }
    }
  });

  it('devuelve array vacío para scope inexistente', async () => {
    const rm = getReadModel();
    const result = await rm.listQuantities('scope-not-found');
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// listCatalogResources
// ---------------------------------------------------------------------------

describe('ReadModel.listCatalogResources', () => {
  it('devuelve al menos un recurso', async () => {
    const rm = getReadModel();
    const resources = await rm.listCatalogResources();
    expect(resources.length).toBeGreaterThan(0);
  });

  it('cada CatalogResourceView tiene id, code, name, resourceType, unit', async () => {
    const rm = getReadModel();
    const resources = await rm.listCatalogResources();
    for (const r of resources) {
      expect(isUuid(r.id)).toBe(true);
      expect(typeof r.code).toBe('string');
      expect(typeof r.name).toBe('string');
      expect(typeof r.resourceType).toBe('string');
      expect(typeof r.unit).toBe('string');
    }
  });

  it('no expone campos internos 🔒 (discount, saving, negotiated, observedPrice)', async () => {
    const rm = getReadModel();
    const resources = await rm.listCatalogResources();
    for (const r of resources) {
      const keys = Object.keys(r);
      expect(keys.some((k) => k.toLowerCase().includes('discount'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('saving'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('negotiated'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('observedprice'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('suppliersku'))).toBe(false);
    }
  });

  it('budgetReferencePrice, cuando presente, es DecimalString', async () => {
    const rm = getReadModel();
    const resources = await rm.listCatalogResources();
    for (const r of resources) {
      if (r.budgetReferencePrice != null) {
        expect(isDecimalString(r.budgetReferencePrice)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Privacidad integral
// ---------------------------------------------------------------------------

describe('Privacidad del read-model', () => {
  it('ningún campo financiero interno llega en los proyectos', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    for (const p of projects) {
      const keys = Object.keys(p);
      const forbidden = ['negotiatedDiscount', 'saving', 'margin', 'actualPurchase'];
      for (const f of forbidden) {
        expect(keys.includes(f)).toBe(false);
      }
    }
  });

  it('los EstimateSummary no tienen campos de ahorro/descuento', async () => {
    const rm = getReadModel();
    const projects = await rm.listProjects();
    const overview = await rm.getProjectOverview(projects[0]!.id);
    const scope = overview!.scopes.find((s) => s.scopeType === 'floor')
      ?? overview!.scopes[0]!;
    const estimates = await rm.listEstimates(scope.id);

    for (const est of estimates) {
      const keys = Object.keys(est);
      expect(keys.some((k) => k.toLowerCase().includes('saving'))).toBe(false);
      expect(keys.some((k) => k.toLowerCase().includes('discount'))).toBe(false);
    }
  });
});
