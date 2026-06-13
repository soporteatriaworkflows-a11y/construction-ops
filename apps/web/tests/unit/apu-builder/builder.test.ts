/**
 * builder.test.ts — Dominio PURO del constructor manual de APU
 * (APU_MANUAL_BUILDER_V1). Cubre composición de costos (materiales, M.O.,
 * herramienta derivada), Decimal, validaciones y precio server-side.
 */
import { describe, expect, it } from 'vitest';
import { previewManualApu } from '@/server/apu-builder/service';
import {
  ApuBuilderValidationError,
  ResourceWithoutApprovedPriceError,
} from '@/server/apu-builder/errors';
import type { ApuBuilderData, ManualApuInput } from '@/lib/apu-builder/types';

const DATA: ApuBuilderData = {
  materials: [
    { id: 'r-porc', code: 'MAT-1', name: 'Porcelanato 60x60', unit: 'm2', resourceType: 'material', approvedPrice: '50000' },
    { id: 'r-adh', code: 'MAT-2', name: 'Adhesivo', unit: 'kg', resourceType: 'material', approvedPrice: '1200.5' },
    { id: 'r-noprice', code: 'MAT-NP', name: 'Sin precio', unit: 'un', resourceType: 'material', approvedPrice: null },
  ],
  laborRoles: [
    { id: 'l-of', code: 'OFICIAL', name: 'Oficial', dailyIntegralCost: '90000', hourlyIntegralCost: '11250' },
    { id: 'l-ay', code: 'AYUDANTE', name: 'Ayudante', dailyIntegralCost: '60000', hourlyIntegralCost: '7500' },
  ],
};

function baseInput(overrides: Partial<ManualApuInput> = {}): ManualApuInput {
  return {
    header: { code: 'APU-1', name: 'Suministro e instalación', unit: 'm2', defaultToolPct: '0' },
    materials: [],
    labor: [],
    ...overrides,
  };
}

describe('previewManualApu — composición de costos', () => {
  it('calcula material = qty × (1+waste) × precio aprobado', () => {
    const p = previewManualApu(
      baseInput({ materials: [{ resourceId: 'r-porc', quantity: '1.05', wastePct: '0.08' }] }),
      DATA,
    );
    // 1.05 × 1.08 × 50000 = 56700
    expect(p.materialsCost).toBe('56700');
    expect(p.unitCostTotal).toBe('56700');
  });

  it('usa el precio server-side de los datos (el navegador no aporta precio)', () => {
    const p = previewManualApu(
      baseInput({ materials: [{ resourceId: 'r-adh', quantity: '2', wastePct: '0' }] }),
      DATA,
    );
    // 2 × 1200.5 = 2401
    expect(p.materialsCost).toBe('2401');
  });

  it('calcula M.O. = rendimiento(días) × integrantes × costo diario', () => {
    const p = previewManualApu(
      baseInput({ labor: [{ laborRoleId: 'l-of', performanceDays: '0.2', memberCount: '1' }] }),
      DATA,
    );
    // 0.2 × 1 × 90000 = 18000
    expect(p.laborCost).toBe('18000');
    expect(p.unitCostTotal).toBe('18000');
  });

  it('aplica herramienta menor derivada = pct × M.O. (no como fila)', () => {
    const p = previewManualApu(
      baseInput({
        header: { code: 'A', name: 'B', unit: 'm2', defaultToolPct: '0.05' },
        labor: [
          { laborRoleId: 'l-of', performanceDays: '1', memberCount: '1' },
          { laborRoleId: 'l-ay', performanceDays: '1', memberCount: '2' },
        ],
      }),
      DATA,
    );
    // labor = 90000 + 2×60000 = 210000; tool = 0.05 × 210000 = 10500
    expect(p.laborCost).toBe('210000');
    expect(p.toolDerivedCost).toBe('10500');
    expect(p.unitCostTotal).toBe('220500');
  });

  it('compone materiales + M.O. + herramienta con Decimal completo', () => {
    const p = previewManualApu(
      baseInput({
        header: { code: 'A', name: 'B', unit: 'm2', defaultToolPct: '0.1' },
        materials: [
          { resourceId: 'r-porc', quantity: '1', wastePct: '0.1' },
          { resourceId: 'r-adh', quantity: '3.5', wastePct: '0' },
        ],
        labor: [{ laborRoleId: 'l-of', performanceDays: '0.25', memberCount: '2' }],
      }),
      DATA,
    );
    // mat = 1×1.1×50000 + 3.5×1200.5 = 55000 + 4201.75 = 59201.75
    // labor = 0.25×2×90000 = 45000 ; tool = 0.1×45000 = 4500
    expect(p.materialsCost).toBe('59201.75');
    expect(p.laborCost).toBe('45000');
    expect(p.toolDerivedCost).toBe('4500');
    expect(p.unitCostTotal).toBe('108701.75');
  });
});

describe('previewManualApu — validaciones', () => {
  it('exige código, descripción y unidad', () => {
    expect(() =>
      previewManualApu(baseInput({ header: { code: '', name: 'x', unit: 'm2', defaultToolPct: '0' }, materials: [{ resourceId: 'r-porc', quantity: '1', wastePct: '0' }] }), DATA),
    ).toThrow(ApuBuilderValidationError);
    expect(() =>
      previewManualApu(baseInput({ header: { code: 'A', name: '', unit: 'm2', defaultToolPct: '0' }, materials: [{ resourceId: 'r-porc', quantity: '1', wastePct: '0' }] }), DATA),
    ).toThrow(ApuBuilderValidationError);
    expect(() =>
      previewManualApu(baseInput({ header: { code: 'A', name: 'x', unit: '  ', defaultToolPct: '0' }, materials: [{ resourceId: 'r-porc', quantity: '1', wastePct: '0' }] }), DATA),
    ).toThrow(ApuBuilderValidationError);
  });

  it('exige al menos un componente', () => {
    expect(() => previewManualApu(baseInput(), DATA)).toThrow(/al menos un componente/);
  });

  it('rechaza material sin precio aprobado (no inventa precio)', () => {
    expect(() =>
      previewManualApu(baseInput({ materials: [{ resourceId: 'r-noprice', quantity: '1', wastePct: '0' }] }), DATA),
    ).toThrow(ResourceWithoutApprovedPriceError);
  });

  it('rechaza recurso inexistente en el catálogo', () => {
    expect(() =>
      previewManualApu(baseInput({ materials: [{ resourceId: 'r-ghost', quantity: '1', wastePct: '0' }] }), DATA),
    ).toThrow(ApuBuilderValidationError);
  });

  it('rechaza desperdicio negativo', () => {
    expect(() =>
      previewManualApu(baseInput({ materials: [{ resourceId: 'r-porc', quantity: '1', wastePct: '-0.1' }] }), DATA),
    ).toThrow(ApuBuilderValidationError);
  });

  it('rechaza cantidad negativa', () => {
    expect(() =>
      previewManualApu(baseInput({ materials: [{ resourceId: 'r-porc', quantity: '-1', wastePct: '0' }] }), DATA),
    ).toThrow(ApuBuilderValidationError);
  });

  it('rechaza herramienta menor fuera de [0,1]', () => {
    expect(() =>
      previewManualApu(
        baseInput({ header: { code: 'A', name: 'x', unit: 'm2', defaultToolPct: '1.5' }, labor: [{ laborRoleId: 'l-of', performanceDays: '1', memberCount: '1' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('rechaza rol de M.O. inexistente', () => {
    expect(() =>
      previewManualApu(baseInput({ labor: [{ laborRoleId: 'l-ghost', performanceDays: '1', memberCount: '1' }] }), DATA),
    ).toThrow(ApuBuilderValidationError);
  });
});
