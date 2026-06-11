/**
 * apu-detail.test.ts — getApuDetail / listApus sobre el fixture v2.1.0.
 * Propiedad: agent-db-rls.
 * Contrato: docs/APU_COST_MODEL_FOUNDATION_V1_CONTRACT.md §10, §15.
 *
 * Cubre: detalle con componentes y desglose por tipo, herramienta menor
 * derivada, trazabilidad del rol laboral, privacidad por rol (client no ve el
 * rol salarial), aislamiento por organización y regresión de listApus.
 */
import { describe, it, expect } from 'vitest';
import { FixtureReadModelRepository } from '@/server/read-model/fixture-repository';
import { ApuNotFoundError } from '@/server/read-model/errors';
import { toDecimal } from '@/modules/apu';
import type { ViewerContext } from '@/lib/contracts/read-model';
import fixture from '../../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';

const ORG = fixture.organization.id;
const APU_PORC = '00000000-0000-4000-8000-000000000090'; // defaultToolPct 0
const APU_CREW = '00000000-0000-4000-8000-000000000091'; // cuadrilla + tool 5%

const internalViewer: ViewerContext = { organizationId: ORG, role: 'internal' };
const clientViewer: ViewerContext = { organizationId: ORG, role: 'client' };
const otherOrgViewer: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-0000000000ff',
  role: 'internal',
};

const repo = new FixtureReadModelRepository();

describe('getApuDetail — APU cuadrilla (2 Ayudantes + 1 Oficial)', () => {
  it('devuelve componentes con tipo, rendimiento, desperdicio y rol laboral', async () => {
    const d = await repo.getApuDetail(internalViewer, APU_CREW);
    expect(d.code).toBe('APU-MURO-LAD');
    expect(d.components.length).toBe(3);

    const material = d.components.find((c) => c.componentType === 'material')!;
    expect(material.quantity).toBe('0.3000000000');
    expect(material.wastePct).toBe('0.0500000000');

    const laborAy = d.components.find((c) => c.laborRoleCode === 'ROL-AY-001')!;
    expect(laborAy.componentType).toBe('labor');
    expect(laborAy.laborRoleName).toBe('Ayudante');
    expect(toDecimal(laborAy.quantity).toFixed()).toBe('0.4'); // 0.2 días × 2

    const laborOf = d.components.find((c) => c.laborRoleCode === 'ROL-OF-001')!;
    expect(laborOf.laborRoleName).toBe('Oficial');
    expect(toDecimal(laborOf.quantity).toFixed()).toBe('0.2'); // 0.2 días × 1
  });

  it('calcula herramienta menor derivada y total (valores reproducibles)', async () => {
    const d = await repo.getApuDetail(internalViewer, APU_CREW);
    expect(d.defaultToolPct).toBe('0.05');
    expect(toDecimal(d.unitCostMaterials).toFixed()).toBe('8820');
    expect(toDecimal(d.unitCostLabor).toFixed()).toBe('55932.5');
    expect(toDecimal(d.unitCostToolDerived).toFixed()).toBe('2796.625');
    expect(toDecimal(d.unitCostTools).toFixed()).toBe('2796.625');
    expect(toDecimal(d.unitCostTotal).toFixed()).toBe('67549.125');
  });

  it('unidad canónica reutilizada: raw m2 ⇒ canónica m²', async () => {
    const d = await repo.getApuDetail(internalViewer, APU_CREW);
    expect(d.unit).toBe('m2'); // RAW preservado
    expect(d.unitCanonical).toBe('m²');
  });
});

describe('getApuDetail — compatibilidad y privacidad', () => {
  it('APU existente sin tool pct conserva su costo (suma de componentes)', async () => {
    const d = await repo.getApuDetail(internalViewer, APU_PORC);
    expect(d.defaultToolPct).toBe('0');
    expect(toDecimal(d.unitCostToolDerived).toFixed()).toBe('0');
    // 62370 + 6000 = 68370 (sin cambios vs v2.0.0)
    expect(toDecimal(d.unitCostTotal).toFixed()).toBe('68370');
    // Trazabilidad agregada sin alterar snapshots: labor → Oficial.
    const labor = d.components.find((c) => c.componentType === 'labor')!;
    expect(labor.laborRoleCode).toBe('ROL-OF-001');
    expect(labor.unitPriceSnapshot).toBe('120000.0000000000');
  });

  it('rol client NO recibe laborRoleCode/laborRoleName (🔒 backend-first)', async () => {
    const d = await repo.getApuDetail(clientViewer, APU_CREW);
    for (const c of d.components) {
      expect('laborRoleCode' in c).toBe(false);
      expect('laborRoleName' in c).toBe(false);
    }
    // Los costos siguen visibles (presupuesto cliente-safe).
    expect(toDecimal(d.unitCostTotal).toFixed()).toBe('67549.125');
  });

  it('viewer de otra organización ⇒ ApuNotFoundError (sin fuga)', async () => {
    await expect(repo.getApuDetail(otherOrgViewer, APU_CREW)).rejects.toBeInstanceOf(
      ApuNotFoundError,
    );
  });

  it('APU inexistente ⇒ ApuNotFoundError (sin fallback)', async () => {
    await expect(
      repo.getApuDetail(internalViewer, '00000000-0000-4000-8000-00000000dead'),
    ).rejects.toBeInstanceOf(ApuNotFoundError);
  });
});

describe('listApus — regresión y costo completo', () => {
  it('APU porcelanato intacto (68370) y APU cuadrilla con herramienta (67549.125)', async () => {
    const apus = await repo.listApus(internalViewer);
    expect(apus.length).toBe(2);
    const porc = apus.find((a) => a.id === APU_PORC)!;
    const crew = apus.find((a) => a.id === APU_CREW)!;
    expect(toDecimal(porc.unitCost).toFixed()).toBe('68370');
    expect(porc.componentCount).toBe(2);
    expect(toDecimal(crew.unitCost).toFixed()).toBe('67549.125');
    expect(crew.componentCount).toBe(3);
  });

  it('viewer de otra organización no ve APU', async () => {
    expect(await repo.listApus(otherOrgViewer)).toEqual([]);
  });
});
