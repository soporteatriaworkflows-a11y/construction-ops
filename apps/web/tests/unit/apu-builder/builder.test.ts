/**
 * builder.test.ts — Dominio PURO del constructor manual de APU
 * (APU_MANUAL_BUILDER_V1). Cubre composición de costos (materiales, M.O.,
 * herramienta derivada), Decimal, validaciones y precio server-side.
 */
import { describe, expect, it, vi } from 'vitest';
import { previewManualApu } from '@/server/apu-builder/service';
import { archiveManualApu, loadApuForCopy } from '@/server/apu-builder';
import {
  ApuArchiveError,
  ApuBuilderValidationError,
  ResourceWithoutApprovedPriceError,
} from '@/server/apu-builder/errors';
import { DbApuBuilderRepository } from '@/server/apu-builder/db-repository';
import type {
  ApuBuilderData,
  CopyFromApuData,
  ManualApuInput,
} from '@/lib/apu-builder/types';
import type { AuthenticatedViewer } from '@/server/auth/types';

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

describe('previewManualApu — validación estricta > 0 (hotfix)', () => {
  it('rechaza material con cantidad = 0', () => {
    expect(() =>
      previewManualApu(
        baseInput({ materials: [{ resourceId: 'r-porc', quantity: '0', wastePct: '0' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('rechaza material con cantidad = "0.0"', () => {
    expect(() =>
      previewManualApu(
        baseInput({ materials: [{ resourceId: 'r-porc', quantity: '0.0', wastePct: '0' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('permite material con cantidad mínima positiva (0.0001)', () => {
    const p = previewManualApu(
      baseInput({ materials: [{ resourceId: 'r-porc', quantity: '0.0001', wastePct: '0' }] }),
      DATA,
    );
    expect(p.materialsCost).not.toBe('0');
  });

  it('rechaza labor con performanceDays = 0', () => {
    expect(() =>
      previewManualApu(
        baseInput({ labor: [{ laborRoleId: 'l-of', performanceDays: '0', memberCount: '1' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('rechaza labor con performanceDays = "0.00"', () => {
    expect(() =>
      previewManualApu(
        baseInput({ labor: [{ laborRoleId: 'l-of', performanceDays: '0.00', memberCount: '1' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('rechaza labor con memberCount = 0', () => {
    expect(() =>
      previewManualApu(
        baseInput({ labor: [{ laborRoleId: 'l-of', performanceDays: '1', memberCount: '0' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('permite labor con performanceDays y memberCount positivos mínimos', () => {
    const p = previewManualApu(
      baseInput({ labor: [{ laborRoleId: 'l-of', performanceDays: '0.01', memberCount: '1' }] }),
      DATA,
    );
    expect(p.laborCost).not.toBe('0');
  });

  it('rechaza waste_pct >= 100 (fracción >= 1)', () => {
    expect(() =>
      previewManualApu(
        baseInput({ materials: [{ resourceId: 'r-porc', quantity: '1', wastePct: '1' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('permite waste_pct = 0 (sin desperdicio)', () => {
    const p = previewManualApu(
      baseInput({ materials: [{ resourceId: 'r-porc', quantity: '1', wastePct: '0' }] }),
      DATA,
    );
    expect(p.materialsCost).toBe('50000');
  });

  it('cantidad negativa de material sigue siendo rechazada', () => {
    expect(() =>
      previewManualApu(
        baseInput({ materials: [{ resourceId: 'r-porc', quantity: '-1', wastePct: '0' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('performanceDays negativo sigue siendo rechazado', () => {
    expect(() =>
      previewManualApu(
        baseInput({ labor: [{ laborRoleId: 'l-of', performanceDays: '-0.5', memberCount: '1' }] }),
        DATA,
      ),
    ).toThrow(ApuBuilderValidationError);
  });

  it('recálculo Decimal correcto (paridad módulo APU canónico)', () => {
    const p = previewManualApu(
      baseInput({
        materials: [{ resourceId: 'r-porc', quantity: '2', wastePct: '0.1' }],
      }),
      DATA,
    );
    // 2 × 1.1 × 50000 = 110000 exacto con Decimal
    expect(p.materialsCost).toBe('110000');
    expect(p.unitCostTotal).toBe('110000');
  });
});

const VIEWER: AuthenticatedViewer = {
  userId: 'auth-1',
  organizationId: 'org-1',
  profileId: 'user-1',
  role: 'management',
};

const VIEWER_SITE: AuthenticatedViewer = {
  userId: 'auth-2',
  organizationId: 'org-1',
  profileId: 'user-2',
  role: 'site',
};

describe('archiveManualApu — servicio de archivado', () => {
  it('archiva APU manual sin BOQ vinculado (happy path)', async () => {
    const mockRepo = {
      archiveManualApu: vi.fn().mockResolvedValue({ archivedAt: '2026-06-13T10:00:00Z' }),
    } as unknown as DbApuBuilderRepository;

    const result = await archiveManualApu(
      VIEWER,
      { apuTemplateId: 'apu-1', reason: 'APU creado con valores incorrectos' },
      { repo: mockRepo },
    );
    expect(result.archivedAt).toBe('2026-06-13T10:00:00Z');
    expect(mockRepo.archiveManualApu).toHaveBeenCalledWith(
      VIEWER,
      { apuTemplateId: 'apu-1', reason: 'APU creado con valores incorrectos' },
    );
  });

  it('rechaza rol site (no tiene permiso)', async () => {
    const mockRepo = { archiveManualApu: vi.fn() } as unknown as DbApuBuilderRepository;
    await expect(
      archiveManualApu(VIEWER_SITE, { apuTemplateId: 'apu-1', reason: 'motivo' }, { repo: mockRepo }),
    ).rejects.toThrow();
  });

  it('propaga ApuArchiveError cuando el RPC devuelve apu_has_boq_items', async () => {
    const mockRepo = {
      archiveManualApu: vi.fn().mockRejectedValue(
        new ApuArchiveError('apu_has_boq_items', 'APU tiene BOQ vinculado'),
      ),
    } as unknown as DbApuBuilderRepository;

    await expect(
      archiveManualApu(VIEWER, { apuTemplateId: 'apu-1', reason: 'motivo' }, { repo: mockRepo }),
    ).rejects.toBeInstanceOf(ApuArchiveError);
  });

  it('propaga ApuArchiveError cuando el RPC devuelve apu_already_archived', async () => {
    const mockRepo = {
      archiveManualApu: vi.fn().mockRejectedValue(
        new ApuArchiveError('apu_already_archived', 'Ya archivado'),
      ),
    } as unknown as DbApuBuilderRepository;

    await expect(
      archiveManualApu(VIEWER, { apuTemplateId: 'apu-1', reason: 'motivo' }, { repo: mockRepo }),
    ).rejects.toBeInstanceOf(ApuArchiveError);
  });

  it('propaga ApuArchiveError cuando el RPC devuelve apu_not_archivable_type', async () => {
    const mockRepo = {
      archiveManualApu: vi.fn().mockRejectedValue(
        new ApuArchiveError('apu_not_archivable_type', 'No es manual'),
      ),
    } as unknown as DbApuBuilderRepository;

    await expect(
      archiveManualApu(VIEWER, { apuTemplateId: 'apu-1', reason: 'motivo' }, { repo: mockRepo }),
    ).rejects.toBeInstanceOf(ApuArchiveError);
  });

  it('rechaza razón vacía sin invocar el repositorio', async () => {
    const mockRepo = { archiveManualApu: vi.fn() } as unknown as DbApuBuilderRepository;
    await expect(
      archiveManualApu(VIEWER, { apuTemplateId: 'apu-1', reason: '   ' }, { repo: mockRepo }),
    ).rejects.toBeInstanceOf(ApuArchiveError);
    expect(mockRepo.archiveManualApu).not.toHaveBeenCalled();
  });
});

describe('loadApuForCopy — precarga de APU origen', () => {
  const COPY_DATA: CopyFromApuData = {
    header: { code: 'APU-1', name: 'Suministro piso', unit: 'm2', defaultToolPct: '0.05' },
    materials: [{ resourceId: 'r-1', quantity: '1.5', wastePct: '0.08' }],
    labor: [{ laborRoleId: 'l-1', performanceDays: '0.2', memberCount: '1' }],
    originName: 'APU-1 · Suministro piso',
    isArchived: false,
  };

  it('retorna datos precargados del APU origen (happy path)', async () => {
    const mockRepo = {
      loadApuForCopy: vi.fn().mockResolvedValue(COPY_DATA),
    } as unknown as DbApuBuilderRepository;

    const result = await loadApuForCopy(VIEWER, 'apu-1', { repo: mockRepo });
    expect(result).not.toBeNull();
    expect(result?.header.code).toBe('APU-1');
    expect(result?.materials).toHaveLength(1);
    expect(result?.labor).toHaveLength(1);
    expect(result?.isArchived).toBe(false);
  });

  it('retorna null si el APU no existe en la org (cross-org)', async () => {
    const mockRepo = {
      loadApuForCopy: vi.fn().mockResolvedValue(null),
    } as unknown as DbApuBuilderRepository;

    const result = await loadApuForCopy(VIEWER, 'apu-inexistente', { repo: mockRepo });
    expect(result).toBeNull();
  });

  it('permite cargar APU archivado para duplicar', async () => {
    const archivedData: CopyFromApuData = { ...COPY_DATA, isArchived: true };
    const mockRepo = {
      loadApuForCopy: vi.fn().mockResolvedValue(archivedData),
    } as unknown as DbApuBuilderRepository;

    const result = await loadApuForCopy(VIEWER, 'apu-archivado', { repo: mockRepo });
    expect(result?.isArchived).toBe(true);
  });

  it('rechaza rol site', async () => {
    const mockRepo = { loadApuForCopy: vi.fn() } as unknown as DbApuBuilderRepository;
    await expect(
      loadApuForCopy(VIEWER_SITE, 'apu-1', { repo: mockRepo }),
    ).rejects.toThrow();
  });
});
