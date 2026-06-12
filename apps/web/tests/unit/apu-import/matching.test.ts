/**
 * matching.test.ts — MATCHING del importador APU (mandato 4B.2, pruebas 11–20).
 */
import { describe, expect, it } from 'vitest';
import {
  buildResourceMatchIndex,
  matchMaterialComponent,
} from '@/server/apu-import/matching';
import { parseApuSheet } from '@/server/apu-import/parse-apu-sheet';
import { buildApuImportPreview, type ExistingLaborRole } from '@/server/apu-import/preview';
import type { ResourceIdentifier } from '@/server/catalog/import/price-list';
import {
  activitiesHeaderCells,
  gridFromCells,
  resourceIdentifiers,
  salaryBlockCells,
  standardActivityCells,
  syntheticSheet,
  type CellSpec,
} from './helpers';

const identifiers = resourceIdentifiers() as ResourceIdentifier[];
const index = buildResourceMatchIndex(identifiers);

function buildPreview(extra?: CellSpec[], roles?: ExistingLaborRole[]) {
  const { grid, lastRow } = syntheticSheet(extra);
  return buildApuImportPreview({
    fileName: 'x.xlsx',
    sheetName: 'APU',
    digest: 'd'.repeat(64),
    parsed: parseApuSheet(grid, lastRow),
    identifiers,
    existingLaborRoles: roles ?? [],
    existingApuCodes: new Set(),
    baselinePrices: new Map(),
    linkVersionId: null,
    boqCandidates: null,
  });
}

describe('apu-import matching (11–20)', () => {
  // (11) material code exacto.
  it('11. code exacto del catálogo ⇒ exact match automático', () => {
    const outcome = matchMaterialComponent(index, {
      rawCode: 'MAT-CEM-001',
      description: 'cualquier descripción',
      rawUnit: 'Un',
    });
    expect(outcome.kind).toBe('exact');
    if (outcome.kind === 'exact') {
      expect(outcome.via).toBe('code');
      expect(outcome.resource.code).toBe('MAT-CEM-001');
    }
  });

  // (12) referencia exacta.
  it('12. external_reference exacta ⇒ exact match', () => {
    const outcome = matchMaterialComponent(index, {
      rawCode: 'REF-456',
      description: 'otra cosa',
      rawUnit: 'Un',
    });
    expect(outcome.kind).toBe('exact');
    if (outcome.kind === 'exact') expect(outcome.via).toBe('reference');
  });

  // (13) SKU exacto.
  it('13. external_sku exacto ⇒ exact match', () => {
    const outcome = matchMaterialComponent(index, {
      rawCode: 'SKU-123',
      description: 'otra cosa',
      rawUnit: 'Un',
    });
    expect(outcome.kind).toBe('exact');
    if (outcome.kind === 'exact') expect(outcome.via).toBe('sku');
  });

  // (14) descripción solo sugerencia.
  it('14. descripción normalizada idéntica ⇒ SOLO sugerencia (jamás exact)', () => {
    const outcome = matchMaterialComponent(index, {
      rawCode: 'Insumo',
      description: 'CEMENTO  GRIS x 50kg',
      rawUnit: 'Un',
    });
    expect(outcome.kind).toBe('suggested');
    // Y en el preview el plan NO asocia el recurso sin acepte explícito.
    const { preview, plans } = buildPreview();
    const material = preview.activities[0]!.components[0]!;
    expect(material.match).toBe('suggested');
    expect(material.resourceName).toBe('Cemento gris x 50Kg');
    const plannedMaterial = plans[0]!.components.find((c) => c.componentType === 'material')!;
    expect(plannedMaterial.resourceId).toBeNull();
    expect(plannedMaterial.unitPriceSource).toBe('manual');
  });

  // (15) ambiguo no auto-link.
  it('15. dos recursos con la misma descripción ⇒ ambiguous, no se asocia', () => {
    const dup: ResourceIdentifier[] = [
      ...identifiers,
      { ...identifiers[0]!, id: '00000000-0000-4000-8000-0000000000c3', code: 'MAT-CEM-002' },
    ];
    const outcome = matchMaterialComponent(buildResourceMatchIndex(dup), {
      rawCode: 'Insumo',
      description: 'Cemento gris x 50Kg',
      rawUnit: 'Un',
    });
    expect(outcome.kind).toBe('ambiguous');
  });

  // (16) unresolved no auto-link.
  it('16. sin coincidencias ⇒ unresolved; el componente se importa sin recurso', () => {
    const { preview, plans } = buildPreview([
      ...standardActivityCells(40, {
        code: 'P-09',
        description: 'Actividad con material desconocido',
        materialDescription: 'Material inexistente XYZ',
      }),
    ]);
    const activity = preview.activities[1]!;
    expect(activity.components[0]!.match).toBe('unresolved');
    const plan = plans[1]!;
    const material = plan.components.find((c) => c.componentType === 'material')!;
    expect(material.resourceId).toBeNull();
    expect(material.unitPriceSource).toBe('manual');
    expect(material.notes).toContain('Sin asociar');
  });

  // (17/18) Oficial y Ayudante → labor_role_id (reuso de roles existentes).
  it('17/18. cuadrilla 2 Ayudantes + 1 Oficial ⇒ una fila labor por rol con labor_role_id', () => {
    const roles: ExistingLaborRole[] = [
      {
        id: '00000000-0000-4000-8000-00000000e001',
        code: 'ROL-OF-001',
        name: 'Oficial',
        factors: {
          baseSalary: '2000000',
          transportSubsidy: '100000',
          benefitsPct: '0.1',
          socialSecurityPct: '0.05',
          payrollTaxPct: '0.025',
          uniformCost: '300000',
          uniformPeriodMonths: '3',
          workingDaysMonth: '25',
          workingHoursDay: '8',
        },
      },
      {
        id: '00000000-0000-4000-8000-00000000e002',
        code: 'ROL-AY-001',
        name: 'Ayudante',
        factors: {
          baseSalary: '1500000',
          transportSubsidy: '100000',
          benefitsPct: '0.13333',
          socialSecurityPct: '0.0666',
          payrollTaxPct: '0.0333',
          uniformCost: '300000',
          uniformPeriodMonths: '3',
          workingDaysMonth: '25',
          workingHoursDay: '8',
        },
      },
    ];
    const { preview, plans, laborResolutions } = buildPreview(undefined, roles);
    expect(laborResolutions.get('oficial')!.action).toBe('reuse');
    expect(laborResolutions.get('oficial')!.laborRoleId).toBe(
      '00000000-0000-4000-8000-00000000e001',
    );
    expect(laborResolutions.get('ayudante')!.laborRoleId).toBe(
      '00000000-0000-4000-8000-00000000e002',
    );
    const laborPlan = plans[0]!.components.filter((c) => c.componentType === 'labor');
    expect(laborPlan).toHaveLength(2); // una fila por rol (encoding §3.6)
    const ayudante = laborPlan.find((c) => c.laborRole === 'ayudante')!;
    const oficial = laborPlan.find((c) => c.laborRole === 'oficial')!;
    expect(ayudante.quantity).toBe('0.4'); // 0.2 HC × 2
    expect(oficial.quantity).toBe('0.2'); // 0.2 HC × 1
    expect(ayudante.unitPriceSource).toBe('labor_role');
    // El snapshot usa el costo hora derivado de la HOJA (evidencia).
    expect(ayudante.unitPriceSnapshot).toBe('10250');
    expect(oficial.unitPriceSnapshot).toBe('12750');
    expect(preview.laborRoles.every((r) => r.action === 'reuse')).toBe(true);
  });

  // (19) laboral desconocido no se inventa.
  it('19. descripción laboral desconocida ⇒ unresolved, actividad en error, sin rol inventado', () => {
    const cells: CellSpec[] = [
      ...salaryBlockCells(),
      ...activitiesHeaderCells(25),
      [26, 'A', 'P-09'], [26, 'B', 'Actividad rara'], [26, 'C', 'M2'],
      [27, 'A', 'M.O'], [27, 'B', 'Mano de obra especialista soldador'], [27, 'C', 'HC'],
      [27, 'D', 0.5], [27, 'E', 0], [27, 'F', 50000], [27, 'G', 25000],
      [28, 'B', 'TOTAL COSTO ACTIVIDAD'], [28, 'G', 25000],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const { preview, plans } = buildApuImportPreview({
      fileName: 'x.xlsx',
      sheetName: 'APU',
      digest: 'd'.repeat(64),
      parsed: parseApuSheet(grid, lastRow),
      identifiers,
      existingLaborRoles: [],
      existingApuCodes: new Set(),
      baselinePrices: new Map(),
      linkVersionId: null,
      boqCandidates: null,
    });
    const activity = preview.activities[0]!;
    expect(activity.status).toBe('error');
    expect(activity.importAction).toBe('omit');
    expect(activity.errors.some((e) => e.includes('no se inventan roles'))).toBe(true);
    expect(plans[0]!.components).toEqual([]);
  });

  // (20) tool derivada no se duplica.
  it('20. herramienta derivada (G·35%) NO crea fila y NO se suma dos veces', () => {
    const { preview, plans } = buildPreview();
    const activity = preview.activities[0]!;
    expect(activity.defaultToolPct).toBe('0.35');
    // Sin fila tool en componentes ni en el plan.
    expect(activity.components.some((c) => c.componentType === 'tool')).toBe(false);
    expect(plans[0]!.components.some((c) => c.componentType === 'tool')).toBe(false);
    // Total incluye la derivada UNA sola vez: 3500.97 + 6650 + 2327.5.
    expect(activity.recalculatedTotal).toBe('12478.47');
  });

  it('20b. herramienta con precio fijo (sin patrón derivado) se conserva como fila explícita', () => {
    const cells: CellSpec[] = [
      ...salaryBlockCells(),
      ...activitiesHeaderCells(25),
      [26, 'A', 'P-09'], [26, 'B', 'Actividad con herramienta explícita'], [26, 'C', 'M2'],
      [27, 'A', 'Herramienta'], [27, 'B', 'Pulidora alquilada'], [27, 'C', 'Gbl'],
      [27, 'D', 2], [27, 'E', 0], [27, 'F', 1500], [27, 'G', 3000],
      [28, 'B', 'TOTAL COSTO ACTIVIDAD'], [28, 'G', 3000],
    ];
    const { grid, lastRow } = gridFromCells(cells);
    const parsed = parseApuSheet(grid, lastRow);
    const activity = parsed.activities[0]!;
    expect(activity.defaultToolPct).toBe('0');
    expect(activity.components).toHaveLength(1);
    expect(activity.components[0]!.kind).toBe('tool');
  });
});
