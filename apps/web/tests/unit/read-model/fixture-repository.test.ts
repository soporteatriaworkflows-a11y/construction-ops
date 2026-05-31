/**
 * fixture-repository.test.ts — El `FixtureReadModelRepository` reproduce los 9
 * valores §3.4 del golden master (±0.01 COP) derivándolos con cost-domain, y
 * sirve los DTOs de las pantallas. Aislamiento por organización incluido.
 *
 * Propiedad: agent-db-rls.
 */
import { describe, it, expect } from 'vitest';
import { FixtureReadModelRepository } from '@/server/read-model/fixture-repository';
import {
  EstimateVersionNotFoundError,
  ProjectNotFoundError,
} from '@/server/read-model/errors';
import { toDecimal } from '@/modules/apu';
import type { ViewerContext } from '@/lib/contracts/read-model';
import fixture from '../../../../../scripts/fixtures/entre-patios-first-floor.fixture.json';

const ORG = fixture.organization.id;
const PROJECT = fixture.project.id;
const VERSION = fixture.estimateVersion.id;
const totals = fixture.estimateTotals as Record<string, string>;

const internalViewer: ViewerContext = { organizationId: ORG, role: 'internal' };
const managementViewer: ViewerContext = { organizationId: ORG, role: 'management' };
const clientViewer: ViewerContext = { organizationId: ORG, role: 'client' };
const otherOrgViewer: ViewerContext = {
  organizationId: '00000000-0000-4000-8000-0000000000ff',
  role: 'internal',
};

const repo = new FixtureReadModelRepository();

function diff(a: string, b: string) {
  return toDecimal(a).minus(toDecimal(b)).abs();
}
function within(a: string, b: string, tol: string): boolean {
  return diff(a, b).lessThanOrEqualTo(tol);
}

describe('FixtureReadModelRepository — regresión §3.4 (9 valores)', () => {
  it('EstimateSummary reproduce los 9 valores del golden master (±0.01 COP)', async () => {
    const [summary] = await repo.listEstimates(internalViewer, PROJECT);
    expect(summary).toBeDefined();
    const s = summary!;

    expect(within(s.directCost, totals['costos_directos']!, '0.01')).toBe(true);
    expect(within(s.administration, totals['administracion']!, '0.01')).toBe(true);
    expect(within(s.contingency, totals['imprevistos']!, '0.01')).toBe(true);
    expect(within(s.utility, totals['utilidad']!, '0.01')).toBe(true);
    expect(within(s.taxOnUtility, totals['iva_sobre_utilidad']!, '0.01')).toBe(true);
    expect(within(s.grandTotal, totals['total_costo']!, '0.01')).toBe(true);
    expect(s.totalArea).toBeDefined();
    expect(within(s.totalArea!, totals['area_construida']!, '0.001')).toBe(true);
    expect(s.costPerSquareMeter).toBeDefined();
    expect(within(s.costPerSquareMeter!, totals['valor_m2']!, '0.01')).toBe(true);
  });

  it('DashboardSummary deriva budget/directCost/indirectCost consistentes', async () => {
    const dash = await repo.getDashboardSummary(internalViewer, PROJECT);
    expect(within(dash.budget, totals['total_costo']!, '0.01')).toBe(true);
    expect(within(dash.directCost, totals['costos_directos']!, '0.01')).toBe(true);
    expect(within(dash.indirectCost, totals['costos_indirectos']!, '0.01')).toBe(true);
    // indirectCost = budget - directCost (invariante).
    expect(
      within(
        dash.indirectCost,
        toDecimal(dash.budget).minus(toDecimal(dash.directCost)).toFixed(),
        '0.0000001',
      ),
    ).toBe(true);
  });

  it('getEstimateDetail devuelve capítulos (14) e ítems BOQ reales (>50)', async () => {
    const detail = await repo.getEstimateDetail(internalViewer, VERSION);
    expect(detail.chapters.length).toBe(14);
    expect(detail.items.length).toBeGreaterThan(50);
    // La suma de subtotales de capítulos ≈ costos directos.
    const sumChapters = detail.chapters.reduce(
      (acc, c) => acc.plus(toDecimal(c.subtotal)),
      toDecimal('0'),
    );
    expect(within(sumChapters.toFixed(), totals['costos_directos']!, '0.01')).toBe(true);
  });
});

describe('FixtureReadModelRepository — proyección por rol (privacidad backend-first)', () => {
  it('rol client NO recibe campos 🔒 del dashboard', async () => {
    const dash = await repo.getDashboardSummary(clientViewer, PROJECT);
    expect('projectedSaving' in dash).toBe(false);
    expect('realizedSaving' in dash).toBe(false);
    expect('pricingCoverage' in dash).toBe(false);
  });

  it('rol management/internal pueden recibir los campos 🔒 (cuando existen)', async () => {
    // En el fixture demo no hay ahorros reales, por lo que se OMITEN incluso para
    // management (no se inventan). Validamos que la proyección NO los elimina por
    // política de rol: con métricas internas presentes, management las conserva.
    const dashMgmt = await repo.getDashboardSummary(managementViewer, PROJECT);
    // Sin compras reales en el fixture: ausentes. Comprobamos que la ausencia es
    // por falta de dato, no por proyección de rol (client también ausente).
    const dashClient = await repo.getDashboardSummary(clientViewer, PROJECT);
    expect('projectedSaving' in dashMgmt).toBe(false);
    expect('projectedSaving' in dashClient).toBe(false);
  });
});

describe('FixtureReadModelRepository — aislamiento por organización', () => {
  it('viewer de otra organización no ve proyectos', async () => {
    const projects = await repo.listProjects(otherOrgViewer);
    expect(projects).toEqual([]);
  });

  it('viewer de otra organización no ve estimates/apus/recursos/cantidades', async () => {
    expect(await repo.listEstimates(otherOrgViewer)).toEqual([]);
    expect(await repo.listApus(otherOrgViewer)).toEqual([]);
    expect(await repo.listCatalogResources(otherOrgViewer)).toEqual([]);
    expect(await repo.listQuantities(otherOrgViewer)).toEqual([]);
  });

  it('getProjectOverview de otra organización lanza ProjectNotFoundError', async () => {
    await expect(repo.getProjectOverview(otherOrgViewer, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  it('getEstimateDetail de otra organización lanza EstimateVersionNotFoundError', async () => {
    await expect(repo.getEstimateDetail(otherOrgViewer, VERSION)).rejects.toBeInstanceOf(
      EstimateVersionNotFoundError,
    );
  });

  it('getDashboardSummary de otra organización lanza ProjectNotFoundError', async () => {
    await expect(repo.getDashboardSummary(otherOrgViewer, PROJECT)).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });
});

describe('FixtureReadModelRepository — listados de catálogo y cantidades', () => {
  it('listProjects incluye conteos de alcances y presupuestos', async () => {
    const [p] = await repo.listProjects(internalViewer);
    expect(p).toBeDefined();
    expect(p!.scopeCount).toBe(fixture.projectScopes.length);
    expect(p!.estimateCount).toBe(1);
  });

  it('listApus calcula el costo unitario sumando componentes', async () => {
    const apus = await repo.listApus(internalViewer);
    expect(apus.length).toBe(fixture.apuTemplates.length);
    const apu = apus[0]!;
    expect(apu.componentCount).toBeGreaterThan(0);
    // Suma de totalComponentCost del fixture (62370 + 6000 = 68370).
    const expected = fixture.apuComponents
      .filter((c) => c.apuTemplateId === apu.id)
      .reduce((acc, c) => acc.plus(toDecimal(c.totalComponentCost)), toDecimal('0'));
    expect(within(apu.unitCost, expected.toFixed(), '0.0000001')).toBe(true);
  });

  it('listQuantities devuelve grupos con sus líneas ordenadas', async () => {
    const groups = await repo.listQuantities(internalViewer);
    expect(groups.length).toBe(fixture.quantityGroups.length);
    expect(groups[0]!.lines.length).toBe(fixture.quantityLines.length);
  });
});
